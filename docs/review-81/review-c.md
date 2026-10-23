# Review C (code, server and operations), before round eighty-one

**Verdict: works with faults.** Round 80's live Worker (`/_app/version.json` and corpus `a27e34d376199544`) serves every route I tried correctly. Caching matches the code and `/about/how`. Every answer carries the security headers, the CSP hashes match `src/app.html`, and nothing personal is logged. The whole unit suite passed (4,458 tests, 0 failed), and so did the strict browser suite in Chromium and the Chromium phone (587 passed, 5 skipped, no flakes).

A device that installed round 79's service worker updates cleanly to round 80's. That is proved on two local builds: no stale icon, manifest or offline page, and every collection page works offline afterwards. Search is good for growers: 57 of 61 queries put the right species or genus in the first three (52 of them first).

I found no blocker and no major fault, and six minor ones:
- Round 80's smaller service-worker install breaks the "Share card" on a species page left open across the next deploy (proved).
- Two search ranking misses on names growers type: "hens and chicks" and "rose".
- Seven search-route tests that never run anywhere, the owner's PC included.
- Advisories in two packages that ship in the Worker, devalue and cookie, plus several in dev tools.
- An uncached sitemap file costs about 0.4 s of CPU, which matters only on Workers Free.
- At 2,000 plants and 20,000 log entries, "My plants" takes about 4.4 s to open on a phone with its CPU slowed 4×.

**What I covered.**
- **Live site:** about 380 requests to cultifolio.com, under the 800 allowed (counted in `C-s/reqlog.txt`): 149 by `curl` and about 234 by Chromium (two Core Web Vitals passes, desktop and a Slow-4G phone at 4× CPU, eight pages each, plus one layout-shift probe). About 210 third-party image loads, all made by the pages themselves.
- **Search:** 61 grower queries against the live search.
- **Unit suite:** the whole suite once, under `nohup`.
- **Browser suite:** strict, on port 4781 with `--workers=2`.
- **Local builds:** three, of round 79 (`r80base`), round 80 (`r81r`) and a round-80 variant, for the service-worker update and old-tab test.
- **Device database:** 2,000 plants, 20 spaces and 20,000 log entries (77,040 changes), desktop and a 4×-slowed Pixel 7.
- **Dependencies:** `npm audit --package-lock-only` on a copy of the lockfile. The registry answered.

Reading the timings: `curl` goes through this workspace's proxy (exit at IAD), which adds about 0.2 to 0.3 s. The machine's load average was 3 to 5 on 2 cores throughout, so the local CPU figures are high.

## Issues

### C1. Minor: an open species page cannot draw its share card after the next deploy (round 80's smaller install)

- **What I did.** I ran `C-s/sw/update.mjs` with one Chromium profile across three local servers on port 4781:
  1. **Round 79:** the install.
  2. **Round 80:** the update and the offline checks.
  3. **Round 80b:** round 80 with one string changed in `src/lib/share/card.ts`, so that the card's chunk has a new name, as any later change to that file would give it.

  With `/species/copiapoa-cinerea` of round 80 left open, I opened another tab on 80b. That tab's worker took over the old tab, as designed (`old tab version now 1792759249355`). Then I pressed "Share card" in the old tab.
- **What I saw.** The page printed under the button: "Failed to fetch dynamically imported module: http://127.0.0.1:4781/_app/immutable/chunks/C19Gm2hU.js" (screenshot `C-s/sw/oldtab-share.png`, log `C-s/sw/update.out`). The server answered 404 for the old chunk. The old build's cache (157 entries) did not hold it.
- **Where it comes from.**
  - `src/service-worker.ts`: `PRECACHE` now takes only `__OFFLINE_BUILD__`, the offline pages' files (round 80, U).
  - The fetch handler's `oldCopy` (the `IMMUTABLE` branch) depends on the previous build's cache holding every chunk an old tab may still import. Under round 79 it did: the round-79 cache held 170 entries, the whole build. Since round 80 it holds only what was installed or already asked for.
  - The card's code is imported only when the button is pressed (`src/lib/ui/ShareCard.svelte` line 17). It is on species pages only, so it is never in the offline list.
  - The catch at line 36 shows the browser's message as it is.
  - A move to another page in the old tab is fine: Kit falls back to a full load. I checked: the old tab reached `/compare` normally.
- **What should happen.** Either the worker keeps the previous build's on-demand chunks (precache `$lib/share/card`'s chunk, or the species route's dynamic imports), or `ShareCard` reads a failed import as "a new version is out" and reloads, or says so in words. A grower should never see a module address.
- **How often.** Rarely: it needs a tab open across a deploy that changed that file. It is still a regression that round 80 introduced.

### C2. Minor: two search misses on names growers type ("hens and chicks", "rose")

- **What I did.** I sent 61 queries to `/api/search?…&n=30&shape=2&c=a27e34d376199544`, one every 0.6 s (`C-s/search/run.mjs`, `results.json`).
- **What I saw.**
  - **"hens and chicks"** (the usual American name of Sempervivum) answers only Echeveria lilacina ("Mexican hens-and-chicks") and E. pulvinata. "hen and chicks" answers Sempervivum marmoreum, S. tectorum, Chlorophytum comosum and the two Echeverias. The index holds "Hen-and-chicks" for S. tectorum. The plural "hens" is not read as "hen".
  - **"rose"** still ranks Rosenbergiodendron (3 species), Roseodendron and Rosettea first, puts two Cotoneasters at 8 and 9, and leaves Rosa canina out of the first 30 (total 868). Round 79's review noted the same; it was not in round 80's list.
- **What should happen.**
  - A common name typed with a plural should match its singular, at least for the last word or the head noun.
  - A typed word that is a whole word of common names ("rose") should rank those names above genera that merely begin with the word.
- **Where it comes from.** `$core/search` / `$core/search-files` ranking. This is my reading of the code, not traced line by line.

### C3. Minor: seven search-route tests never run, here or on the owner's PC

- `tests/unit/r67n-search-route.test.ts` line 22 reads a hard-coded `/tmp/rev66/corpus/v2/index.json` and is `describe.skipIf(!have)`.
- Its seven tests were skipped in my full run, and in the owner's predeploy too (`inputs/pc-predeploy-pass.txt` line 1369: `↓ tests/unit/r67n-search-route.test.ts (7 tests | 7 skipped)`).
- They cover ranking rules N1, N2 and N8: older names past the sixth hit, a common name read whole, whole-word matches first, near hits by distance, and the postings answering what the whole index answers. So those rules are tested over a real corpus nowhere.
- **Should:** read a corpus path from an environment variable and use the fixture or round 77's corpus when it is set, or say in the predeploy output that they were skipped.

### C4. Minor: advisories in packages the Worker ships, and in the dev tools

`npm audit --package-lock-only` (`C-s/deps/audit.json`): 12 advisories (7 high, 2 moderate, 3 low).

| Package | Version | Where it runs | Advisories | Fix |
|---|---|---|---|---|
| devalue | 5.9.2 | In the Worker and the client bundle, through Kit's `uneval`/`stringify` of page data | GHSA-mcm9-63f2-9j32 (quadratic expansion in `uneval`, high), GHSA-x5rw-q4pp-hg5g, GHSA-r9w8-h9r3-54w4, and four lower | Within semver: `npm update devalue` |
| cookie | 0.6.0 | In Kit's cookie parsing | GHSA-pxg6-pf52-xh8x (low) | Needs Kit 3 |
| vite | 8.3.0 | Dev only | Six advisories (dev server, launch-editor, some Windows-specific) | Within semver |
| vitest | 5.0.0 | Dev only | Two moderate | Within semver |
| wrangler / miniflare | 4.143.0 | Dev only, with undici 7.29.0 (10 advisories) and sharp 0.35.4 | — | Within semver |
| source-map-js | 1.2.1 | Dev only | One | Within semver |

- None is shown to be exploitable here: the page data comes from the corpus, with only a few echoed query values (compare's `missing`, the 404's name).
- The two packages that ship to production have non-major fixes for devalue. The dev-tool advisories matter on the owner's PC, where `vite dev` and `wrangler dev` run.
- **No unused dependencies:** each of `fflate`, `idb`, `qrcode`, `valibot` and the three font packages is imported.

### C5. Minor (cost, only on Workers Free): an uncached sitemap file costs about 0.4 s of CPU

- **Measured locally.** `sitemapPart` (`src/lib/server/sitemap.ts` line 108) takes 389 ms per 40,000-address file (4.0 MB of XML) with the machine at a load of 4 to 5, timed in a vitest file in my copy (`C-s/cpu-sitemap.test.ts`). It builds a `Date` per address (`dayIso`).
- **Measured live.** `/sitemap-0123abcd-1.xml` (another id, so built fresh) had a first byte at 0.92 s. The held `/sitemap-a27e34d376199544-1.xml` came back with `cf-cache-status: HIT` at 0.41 s.
- **Why it can repeat.** Any `sitemap-<hex>-N.xml` is answered with the current corpus's file and kept only 5 minutes under its own URL. One address may therefore make up to 600 such builds every 10 minutes (the `reference` bucket).
- **What it costs.** On Workers Paid (30 s CPU) this is a fraction of a cent. On Workers Free (10 ms CPU) every one would fail with Error 1102. I cannot see which plan the account is on; DEPLOY line 137 says to move to Paid.
- **Should:** answer only the current corpus's file names (404 for another id), or build the XML once in the corpus build and serve it as stored.

### C6. Minor (performance): at 2,000 plants and 20,000 log entries, "My plants" takes 4.4 s to open on a slowed phone

`C-s/db/scale.mjs` on local round 80. It injects through the same stores the e2e `inject` helper writes. Results in `C-s/db/{desktop,phone}.json`; screenshots `C-s/db/*-plants.png`, `*-today.png`, `*-plant.png`.

| Step | Desktop (1366 px) | Pixel 7, CPU 4× slower |
|---|---|---|
| My plants, first open (no snapshot, 77,040 changes folded) | 2.5 s | 7.3 s |
| My plants, each open after (snapshot) | 0.96 s | 4.4 s |
| Search "lithops" on the device | under 0.2 s | 0.7 s |
| A plant page | 0.42 s | 1.3 s |
| Today | 0.82 s | 1.8 s |
| Backup to a file (781 kB zip) | 2.3 s | 8.9 s |
| Storage used | 12.9 MB | 12.8 MB |
| Two tabs: a plant added in one shows in the other | 25 ms | 174 ms |

- Nothing failed and nothing was lost; the search showed the 120 Lithops and "Labels for these 120".
- But an installed app opened by a grower with a large collection waits about 4 s on a mid-range Android phone each time. 4× throttling on this loaded machine overstates a recent iPhone, which I would expect to be well under that.
- **Not proved:** which part dominates (the snapshot read, the fold of the tail, or rendering 1,920 rows). The page renders every row (`.seccount`, "1920 growing"). A profile on the PC's WebKit would settle it.

### C7. Minor (performance): on a throttled phone, a species page's largest paint is up to 4.1 s, all of it waiting on iNaturalist's photograph

| Page | Desktop LCP | Desktop CLS | Phone LCP (Slow 4G, 4×) | Phone CLS | Phone TBT | Phone INP |
|---|---|---|---|---|---|---|
| `/` (first visit, cold) | 0.94 s | 0 | 2.13 s | 0 | 1,049 ms | 128 ms (typing "echev") |
| `/?by=genus` | 0.50 s | 0 | 1.34 s | 0 | 897 ms | 40 ms |
| `/species/echeveria-elegans` | 0.72 s | 0.001 | **4.06 s** | 0.002 | 1,124 ms | 48 ms (°F toggle) |
| `/species/astrophytum-asterias` | 0.72 s | 0.001 | 2.97 s | 0.002 | 944 ms | 40 ms |
| `/species/abies-marocana` (keyless) | 0.68 s | 0.001 | 1.24 s | 0.002 | 935 ms | 32 ms |
| `/compare?s=aloe-vera,haworthiopsis-attenuata` | 0.82 s | 0.001 | 3.05 s | 0.002 | 683 ms | 16 ms |
| `/plants` (empty) | 0.60 s | 0 | 1.86 s | (0.196, see below) | 691 ms | 40 ms |
| `/about/how` | 0.55 s | 0.001 | 1.00 s | 0 | 693 ms | 32 ms |

Source: `C-s/cwv/cwv.mjs`, results in `C-s/cwv/{desktop,phone}/results.json` and screenshots beside them.

- **Weight.** A first visit to `/` fetches 60 own files (384 kB) and 48 third-party images (611 kB). Later pages fetch 2 to 12 own files, the rest from the HTTP cache. The HTML is 17 to 47 kB compressed (110 to 143 kB decoded).
- **The species page's LCP** is the hero photograph from `inaturalist-open-data`. It is already preloaded with `fetchpriority="high"` and a phone-sized `medium` source, and every other image is `loading="lazy"`. So the 4.06 s is iNaturalist's latency plus my proxy, not the page's order.
- **Total blocking time** of 0.7 to 1.1 s on every page at 4× CPU is hydration. It is the place to look if the phone feels slow.
- **The /plants CLS of 0.196** was measured once on the live phone pass, after the other pages in the same session. A cold live probe with the sources captured gave 0.0003 (`C-s/cwv/cls-live.mjs`), and locally 0.000. I could not reproduce it, so I do not count it as a fault.
- Locally, the phone's Today shifts 0.071 (the frost section and the footer) and Places and Propagation 0.041 (the footer). All are under 0.1.

## Confirmed working

**Round 80's fixes in my area:**
- **C2, the sitemap.** The index is `public, max-age=300`. It names `sitemap-a27e34d376199544-{1,2}.xml`, each `max-age=86400`. Another id or a bare number is answered with `max-age=300`.
- **C3, the hash groups.** `/about/how` now gives the rule: groups of at most 320, at least about 160 past 5,120, doubling. 48,361 species in 256 groups is 189 a group, which fits.
- **C4, the edge and errors.**
  - A 404 (`/species/not-a-plant-zzz`) carries `public, max-age=300` and no `cf-cache-status`.
  - The old-name 302 (`/species/rebutia-fidana` → `weingartia-fidaiana?was=…`) carries `public, max-age=86400` and no edge copy.
  - Both are as the page now says.
- **C5, NEL.** The NEL sentence is on `/about/how`. The headers are still sent (the owner's dashboard toggle).
- **C6, the sync race.** `r63s-concurrent-deletes` passed in the full run and five runs alone.
- **C7, cold search speed.** Cold common-word searches now take 1.1 to 2.0 s ("rose" 1.98, "red flowers" 1.74, "cactus" 1.21, "x" 1.12, "Haworthia Big Band" 1.24), where round 79 took 1.5 to 3.0 s. The median over my 61 grower queries was 0.53 s, p90 1.05 s, max 1.59 s, proxy included.

**The service worker, round 79 to round 80** (`C-s/sw/update.out`):
- **Round 79's install:** one cache of 170 entries, the whole build.
- **The update.** On the next visit, round 80's worker installed, took over and settled within about a minute. Its cache holds 146 entries, including `/manifest.webmanifest`, `/favicon.svg`, `/icon-192.png`, `/offline`, `/` and `/plants`. The manifest read through the worker is the server's.
- **The old cache.** Round 79's cache is kept for one generation, as designed. Storage went from 2.5 MB to 5.6 MB.
- **Offline afterwards:** `/plants`, `/today`, a species page read before, a never-opened fixture page from the cache, `/about/how`, and `/compare` (the "Side by side" page from cache) all opened.
- **Cache growth.** Each later deploy adds a cache of about 146 entries and drops the one two generations back. The corpus cache is pruned at the first answer under a new corpus id.

**Worker routes:**
- **Held pages.** Species pages and `/` are held for 60 s under build, corpus, path, the read query, units and hemisphere.
- **Query handling.** `?utm_source` shares the copy. HEAD is answered from the copy. `accept-language: en-US` renders °F. `__data.json` is `private, no-store`.
- **Reference APIs.** `/api/entries`, `/api/sheets`, `/api/rows` and `/api/search` under `c=` are `public, max-age=86400`, with an edge `HIT` on repeat. Without `c=` they are `no-store`. A wrong bucket count gets a 409.
- **Errors.** Malformed queries get a 400 with a sentence, or an empty list; nothing returned a 500.
- **Assets.** Static app files (`/favicon.svg`, icons, `/og.png`) are `max-age=0, must-revalidate` with an ETag; `/maps/*` a day; `/service-worker.js` revalidated each time.
- **Headers.** HSTS, nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and the Permissions-Policy are on every answer, redirects included. The CSP's two script hashes equal `app.html`'s inline line and Svelte's `this.__e=event`. `img-src` names the four photograph hosts.
- **Crawling.** `/compare` has `noindex`, species pages a canonical.
- **Robustness.** The adoption of a manifest keeps the held corpus until the index and genera it names exist (`src/lib/server/dossiers.ts` around lines 280 to 300). Products are held in a bounded LRU (1,024 files, 12 MB of text).

**Privacy.** Worker observability is off (`wrangler.jsonc`). No `console.*` in server code prints an address, coordinates or a query. The rate counters are keyed by address with a TTL of two windows, as `/about/how` says.

**Sync, from the code and tests.**
- **Keys.** The 30-symbol key (about 147 bits) is split by HKDF into the encryption, auth and name keys.
- **What the server holds.** It stores `SHA-256('token:'+token)` only and never sees the encryption key. Batch names carry a keyed fingerprint.
- **Replay.** AES-GCM's associated data binds vault, kind and object name, so there is no replay across vaults, kinds or names.
- **Limits.** A removal needs the HMAC drop proof. Limits are 2 GB a vault, 3 GB a day an address (12 GB a /48), 5 new vaults a day an address (20 a /48), 200 a day, 2,000 in all and 10 places a network a day. These match `/about/formats`.
- **Tests.** 38 unit files cover sync, the counters, sweeps and quotas, and 18 test the sealing and keys. All passed.

**The suites.**
- **Unit suite:** 491 files passed and 1 was skipped. 4,458 tests passed and 10 were skipped, none failed, in 709 s. The slowest files are the fuzzers and `search-generations` (40 s).
- **Browser suite:** strict, Chromium and phone, 2 workers. 587 passed and 5 were skipped, with no flakes, in 25.6 min. The slowest file is `smoke-3` (6.1 min).
- **No empty tests:** no test file has more tests than assertions, apart from `r71a-spelling` (6 tests, 4 `expect` lines: loops), and none has a `.only` or `todo`.

**Search relevance.** 61 queries:

| Kind | Queries | First | In the first three |
|---|---|---|---|
| Common names | 29 | 21 | 27 |
| Genera | 8 | 8 | 8 |
| Misspellings | 11 | 11 | 11 |
| Older names | 8 | 8 | 8 |
| Hybrids | 5 | 4 | 4 |

The common-name count includes "blood lily" → Scadoxus puniceus, which holds that name.
- **Misspellings** found the species: echevaria, haworthea, mamillaria, gymnocalcium, astrophytum asterius, sanseveria, crassula ovatta, euphorbia obessa, adenium obessum, aloe polyphyla.
- **Older names** went straight to the species: Sansevieria trifasciata → Dracaena trifasciata, Haworthia attenuata → Haworthiopsis attenuata, Echinocactus grusonii → Kroenleinia grusonii, Aloe dichotoma → Aloidendron dichotomum, Senecio rowleyanus → Curio rowleyanus.
- **Cultivars and hybrids.** "Echeveria 'Perle von Nurnberg'" is answered by Echeveria, said as relaxed. "Aloe × nobilis" is relaxed to Aloe (the known hybrid item). "Gasteraloe" finds nothing.
- **"moth orchid"** gives near-spelling orchids marked as similar spellings. No Phalaenopsis in the index has an English name, which is a data gap, not search.

## Not checked, and why

- **The account's plan, live CPU, memory, R2 and KV counts.** These need the dashboard or `wrangler tail`. C5 depends on the plan.
- **WebKit and an iPhone.** Not available here. C6's and C7's phone figures are Chromium at 4× CPU.
- **A NEL report actually sent.** Chromium ignores NEL through a proxy.
- **Sync against the live server.** Forbidden by the brief; reviewed from the code and the unit tests only.
- **The corpus mid-upload, live.** Reviewed in the code only. The upload itself is B's.
- **Cache growth over months, measured.** Read from the code only. Within one build, every species page a device opens is kept (about 130 kB decoded each) until the build two deploys later drops it, and each dossier until the next corpus. Without deploys that grows without a cap. I did not measure it over time.
- **svelte-check and tsc.** Not run again; round 80's merge ran them clean, and the browser build here compiled.

## Needs from the PC

1. **Plants list, iPhone 13 WebKit.** In WebKit (`--project webkit`/`phone-webkit`), with the iPhone 13 descriptor, the open time of `/plants` at 2,000 plants and 20,000 log entries. Run `node C-s\db\scale.mjs phone` with the browser import switched to `webkit` and `devices['iPhone 13']`, and the CPU throttle removed (CDP is Chromium only). Its output is one JSON line.
2. **Cloudflare plan.** Whether the Worker is on Workers Paid (dashboard → Workers & Pages → Plans). C5 is a fault only on Free.

## Files

- **Scripts and outputs:** `/tmp/claude-0/rev81r/C-s/`, with:
  - `req.sh` and `reqlog.txt` (the request count)
  - `live/` (headers and bodies)
  - `search/` (the queries and results)
  - `cwv/` (Core Web Vitals)
  - `sw/` (the update test, its log and screenshots)
  - `db/` (the scale test)
  - `deps/audit.json`
  - `unit/vitest.log` and `vitest.json`
  - `e2e/e2e.log`
- **Local copies:** `r79/`, `r80/` and `r80b/` (the variant with one string changed in `src/lib/share/card.ts`).
- **The code:** `/tmp/claude-0/rev81r/code` was not changed.
