# Review C (code, server, security, races and the suites), round eighty-four

**Verdict: works with faults.** Round 83's Worker (`ba78fb9`, build `1793295284616`) over corpus `e8885155673882ba` answers every route I tried correctly, with the security headers on every answer. The eleven merged addresses each 302 to the right page. Nothing personal is logged. I found no security fault.

The whole unit suite passed: 534 files, 4,796 tests, 3 skipped by design. The strict browser suite also passed in Chromium and the Chromium phone: 693 passed, 5 skipped, no flakes.

A device on round 82 updates cleanly to round 83, and round 83's own offline fix holds.

**One major fault, proved on the live site.** The species picker's list opens over the add form after the grower has left the name field. A tap on the next field then picks a species the grower did not choose (C1). On a phone with the iPhone 13 profile, I typed "Haworthia" on https://cultifolio.com/plants/new and put the keyboard away. About a second later the list of seven names covered the Space and Acquired fields. One tap on the Space field turned the name into "Haworthia cooperi", GBIF 2780103.

**The PC's WebKit fault is not proved.** That is the press on Add that was lost while the name check ran. In Chromium I refuted it for the case the PC met (the name service answering 502): 18 of 18 presses were taken, 9 on the desktop and 9 on the phone. I found a different wrong arming instead (C2).

The other issues are minor:
- species pages read before a deploy are gone offline after it (C3), which is as designed;
- tests that read the source rather than the behaviour, and checks run only in Chromium (C4).

**Scores (my areas).**

| Area | Score | Reason |
|---|---|---|
| Server and Worker | 9 | Every route, error and cache matches the code and /about/how. The 302s and their caching are right. Cold search median 0.95 s through this proxy. |
| Security and privacy | 9 | CSP hashes match. The sync server stores hashes and sealed bytes only. No address in a log. Audit: 0 for production, 5 low that need Kit 3. |
| Races and the device | 6 | The late list over the form (C1, major) and a wrong arming (C2). The Replace lock, two tabs and the database at 2,000 plants are good. |
| Service worker | 8 | The 82→83 update is clean and the old build is swept. A page read by a link now opens offline. Every read page is dropped at each deploy (C3). |
| Suites | 8 | Both suites green and strict. Many fixes are guarded by source-text matches, and 31 tests never run in Safari's engine (C4). |

**What I covered.**
- **Live site:** 197 requests to cultifolio.com, under the 800 allowed (`C-s/reqlog.txt`): 89 by `curl` (headers, routes, errors, the 11 merged addresses, search, rows, sitemap timing) and 108 by Chromium (two live picker checks). No third-party request of my own. No vault, no POST.
- **Local, port 4791 under the lock:**
  - the race harness: 16 scenarios, desktop and phone;
  - the late-list harness: 12 runs plus 2 with six rows;
  - the service-worker update, round 82's build (`c97d40e`) to round 83's (`ba78fb9`), and a link-read page;
  - the database at 2,000 plants and 20,000 log entries, desktop and a 4×-slowed Pixel 7;
  - the browser suite.
- **Unit suite:** the whole suite once, under `nohup`.
- **Revert sweeps:**
  - 26 round-83 files put back one at a time, against the round 82 and 83 unit tests;
  - round 82's own change taken back out of 31 files, the same way.
- **Audit:** `npm audit` against the lock.

---

## Issues

### C1. Major: the species list opens over the add form after the field is left, and a tap meant for the next field picks another species

**What I did**
1. **Live**, `C-s/race/live.mjs`: Chromium with the iPhone 13 profile on https://cultifolio.com/plants/new, service worker blocked, nothing saved. I typed "Haworthia" at 110 ms a key, then tapped the page heading to put the keyboard away, as a grower does before choosing a space.
2. **Locally**, `C-s/race/menu.mjs`, `menu2.mjs`:
   - fixture corpus, `/api/search` delayed 0 to 1,500 ms;
   - the field left 0 to 500 ms after the last key: Tab on the desktop, a tap on the heading on the phone.

**What I saw**
- **Live** (screenshots `C-s/race/live-Haworthia.png` and `live-Haworthia-after.png`):
  - 1.0 s after the keyboard went, with focus on `MAIN`, the list was open with seven rows down to y = 555. It covered the Space field (y 421 to 465) and Acquired.
  - A tap at the Space field's centre changed the name from "Haworthia" to "Haworthia cooperi" with the pill "GBIF 2780103".
  - The list stayed open over the pill, so the change is easy to miss. Add would then file a species the grower never chose.
- **Locally, with six rows:**
  - phone: "Copiapoa" became "Copiapoa hypogaea";
  - desktop: a mouse click on the Space field gave "Copiapoa dealbata" (`menu-phone-open.png`, `menu-phone-after-tap.png`).
- **How often the list stays open after the field is left** (`menu2.mjs`):
  - desktop: 6 of 6 runs, with the search at 0, 300, 600 or 1,000 ms;
  - phone: 5 of 6 runs.
  - Every live search answers in 0.6 to 2.1 s through this proxy (C-s/perf/search-cold.tsv: 20 cold grower queries, median 0.95 s).

**Where it comes from** (my reading, then proved as above)
- `src/lib/ui/SpeciesPicker.svelte`:
  - `search()` sets `open = true` at line 172, and its `show()` does so again at line 169, whenever an answer is still the latest for the text. Neither looks at whether the field still has focus.
  - The search starts 180 ms after the last key (line 255), whatever has happened since.
  - `onBlur`'s close (line 371) runs at 150 ms, so an answer that lands after it reopens the list.
  - Nothing closes the list on a tap outside it.
  - The rows sit inside the form's `<label class="field">`, so a picked row also focuses the input. `onfocus` (line 438) then keeps the list open.
- **The same picker** is on the propagation form and the plant's edit form. I read that, but did not run those forms.

**What should happen.** A list that arrives after the field has been left stays closed, and the answer only updates the pill and the line. A tap outside the picker closes the list.

**Smallest fix.** In `show()` and at the top of `search()`, write `open = root?.contains(document.activeElement) ?? false` instead of `open = true`. Add a `pointerdown` listener on the document that closes the list when the target is outside `root`. A browser spec would type, blur at once with `/api/search` delayed, and expect `.menu[hidden]`.

### C2. Minor: Add pressed while the reference's search is still out, after the name service answered without the exact name, arms instead of adding

**What I did.** `C-s/race/race.mjs`: 16 scenarios, each in Chromium desktop and an iPhone 13 profile.
- **Routes:** `/api/search` delayed 0 to 2,000 ms; `/api/names` answered by a route with a 502, an empty list, or a list without the exact name.
- **The press:** Add at once after `fill`; after `fill` and a blur (the PC's labels test); 260 ms later, while the debounced search was out; after a list from an earlier text; or right after typing letter by letter.
- **Recorded:** the button's labels, the line under the field, and the stored `taxonKey` read back from IndexedDB.

**What I saw.**

*The PC's case: the press is not lost in Chromium.*
- With the name service at 502, every first press was taken: 9 of 9 desktop and 9 of 9 phone.
- The button showed "Checking the name…" and then "Adding…".
- The plant was stored with the right key (`desktop-2.json`: 5384013 and 5411106).
- The check waits for the reference's search (`check()` line 327), and the late answer resolves the name.
- So the WebKit failure in pc-state is not a logic race this code shows in Chromium. Its cause is open; see Needs.

*A different wrong arming, 4 of 4 desktop and 4 of 4 phone.* The name service answered first with other names (as GBIF's suggest does for a name it does not hold, or for a reference page with no GBIF key), and the reference's search was still out (600 or 1,500 ms).
- The first press armed ("Add as typed"), although the reference holds the name.
- When the search answered, the pill turned to "GBIF 5384999" (Copiapoa humilis) or "no key filed" (Hesperocyparis lusitanica, a page without a GBIF key).
- The line under the field still said "Pick a name from the list, or press “Add as typed” to keep exactly what you typed". A grower is told their name is not known while the pill beside it shows its key.
- The second press stored the right key (`desktop-2.json`, `phone-2.json`; screenshot `phone-2-0-inFlight-armed.png`).

**Where it comes from.**
- `check()` searches only when `suggestions` is empty (line 327). The name service's answer has already filled `suggestions` through `show()`, so the search still in flight is not awaited.
- `checkExact()` then decides "no" from the name service alone.
- When the search answers later, its resolution (`search()`, line 204) sets the key but never clears `armed`. The form's `nameArmed` stays true (`plants/new/+page.svelte` line 202).

**Smallest fix.**
- Keep the search's promise for the current text. `check()` awaits it whenever it is the search for `value`, not only when the list is empty.
- Where the late answer resolves the name, also set `armed = false`, as `pick()` does.

### C3. Minor (works as documented): every species page a device has read is gone offline after each deploy

**What I did.** `C-s/sw/update.mjs` used one Chromium profile across round 82's build and round 83's on port 4791. It took the network away by stopping the server, because Chromium's offline switch does not reach the worker's own fetches. The first run with `setOffline` gave false passes, `update.out`. Log: `C-s/sw/update2.out`.

**What I saw.**
1. **Under round 82:**
   - The device read `/species/copiapoa-cinerea` by its address and `/species/copiapoa-humilis` by a link, and added a plant.
   - Offline, cinerea opened. Humilis said "No connection": `/_app/immutable/assets/33.Cku2krCu.css` failed, the fault round 83 fixed.
2. **Round 83 deployed:**
   - On the next visit the new worker installed and took over within 15 s.
   - After a reload and the 10-second look, round 82's cache was gone (4.8 MB down to 2.1 MB). Round 82's O sweep works.
3. **Offline afterwards:**
   - Both species pages said "No connection", with the offline page's true line: "kept once you have opened it on this device since the app last updated itself".
   - The plant page and My plants opened.
   - `/maps/land50.svg`, the close-up map's coastline, is no longer in the worker's cache. Offline it still loaded, from the browser's HTTP cache (`max-age=86400`), so a page kept later loses its coast a day after the file was last fetched. That last point is read from the headers; I did not wait a day.
4. **Read again under round 83:** the page opened offline with its map and coast. A page read by a link also opened offline (`C-s/sw/link.mjs`: heading, 52 dots, its styles), so round 83's install of the species stylesheets works.

**Why it matters.**
- This is the design: the pages a device read live in the build's cache (`src/service-worker.ts`, `CACHE = cultifolio-${version}`), which `pruneOnActivate` and `sweepPrevious` delete.
- But round 83 alone was four deploys. A grower who reads their species before a trip to the greenhouse loses them whenever a deploy happens in between, and the plant page offline then shows no species card. Locally the fixture's sheets were not kept at all, so I could not judge that card. Live, sheets are `public, max-age=86400`, so the corpus cache should hold them.

**Should.** Keep a read species page's data (`/species/<slug>/__data.json`, which the offline page can already open) in a cache that a deploy does not drop. One option is the corpus cache, keyed by corpus and checked against a data-format version. Keep `land50.svg` and `land110.svg` across builds too, or precache them (327 kB).

### C4. Minor: what the suites cannot see

**Source-text guards in place of behaviour.** Several round-82 and round-83 fixes are held by a match on their own source:
- `r82o-headers` 1, 3 and 4 match the cookie line, HSTS and the SYNC_OPEN comments;
- `r82o-sw-keep` 3 matches `capCache(cache, SPECIES_KEEP, isSpeciesEntry)` in `service-worker.ts`;
- `r83w-weight` 2 matches "the hook puts the markup in";
- `r82u-pages` has 23 `toMatch` or `toContain` checks on files.

A revert fails them, as my sweep shows, but so would a rename that keeps the behaviour. And a fault that keeps the text passes them: for example, the cap applied to the wrong cache.

**The revert sweeps.**
- **Round 83, 26 files**, each put back to `c97d40e` and run against the round 82 and 83 unit tests (`C-s/revert/files.tsv`):
  - every file's revert failed at least one test, except four;
  - `postings.ts` (a superset, no change in behaviour, by design) and `sw-keep.ts` (a comment);
  - `SpeciesPicker.svelte` and `routes/+page.svelte` (the merged row's words): no unit test fails, and `tests/e2e/r83k-merged.spec.ts` 1 and 2 cover them.
- **Round 82, its own change taken out of 31 files** (`C-s/revert/r82.tsv`): 6 no longer take round 82's patch cleanly, because round 83 changed them after it (search, the species page, the front page, `still.ts`, `index-entry.ts`, the picker). Of the 25 that applied, 20 failed a unit test. Five did not, and each has a named browser test (read, not run on a reverted build):
  - `ToastBar.svelte` (the Undo toast over a form): `r82d-record` 3;
  - `backup/io.ts` (a restore counted as a backup) and `backup-reminder.svelte.ts` (one reminder at a time): `r82d-record` 1;
  - `propagation/[id]` (a batch's first line): `r82d-record` 2;
  - `ref/Glance.svelte` (the "from few records" mark): `r82u-pages` 12.

  So I found no round 82 or 83 fix whose revert no test would fail.
- **Implementation-pinned outcome:** none of the round 83 data rules (lapse, shapes, default points, iNaturalist addresses) passes reverted; each fails `r83c` or `r83m`.

**Chromium only.**
- `tests/e2e/helpers/engines.ts` leaves 14 titles out of WebKit and Firefox, and 17 more tests tag themselves `@chromium`. Among them:
  - every 200%-text check at 320 px;
  - the numbering race at a 6× CPU throttle;
  - the landscape notch on a phone (`r81u phone 2a`);
  - layout shift on the example page;
  - the request budgets.
- They depend on CDP, so this is by design. But the owner's phone is an iPhone, and nothing checks those layouts or that race in Safari's engine.
- The PC's one failure, the lost press, is itself WebKit-only, and no spec reproduces it on purpose.

**Should.**
- Turn the source-text guards that stand for behaviour into behaviour tests. The cookie's `Secure` can be read from `document.cookie` in the suite over HTTPS, or the `set-cookie` path can be checked.
- Give the WebKit lost press a spec of its own: P's walk has the step.

---

## Confirmed working

**Round 83, as live**
- **The eleven merged addresses** (`C-s/live/m/*.hdr`): each is a 302 with `public, max-age=86400`, to the targets DEPLOY names.
  - `/species/echeveria-peacockii` goes to `/species/echeveria-desmetiana?was=Echeveria%20peacockii`, whose page says "Echeveria peacockii is the name of a page merged into this one. It is also an older name of Dudleya pulverulenta, by another author (Echeveria peacockii Croucher ex T.Moore & Mast.)".
  - The `?was=` page is `private, max-age=60` and not held.
  - The adapter does not keep a 302 at the edge (status not in its list), as /about/how says.
- **The lighter page.** `/species/sempervivum-tectorum` is 174.7 kB decoded and 39.2 kB gzipped.
  - The map is drawn once: 1,050 dot paths, one `land50.svg` and one `land110.svg` reference.
  - The mark is left only inside the data (`regionMark`), and none is left in the HTML.
  - The Kit data is 51 kB.
- **The CSP.** The `app.html` hash (`3LsFZZ…`) and `this.__e=event` (`7dQwUg…`) match `svelte.config.js` and the header. `object-src 'none'` is there. Kit's per-page hash covers its own script.
- **The dependency delivery.** `npm audit --omit=dev`: 0. Full audit: 5 low, all Kit 3 (cookie, Kit's two, deepmerge, the adapter). `r83p-deps` passed, so `node_modules` is the lock's tree (vite 8.3.5, devalue 5.9.4, wrangler 4.155.0).

**Round 82's O fixes**
- `GET /api/sync/vault` answers 405 `allow: POST`.
- `/compare` is rendered on each request (`private, max-age=60`, no edge copy).
- The previous build is swept once its tabs are gone (above).
- `r82o-worker`, `r82d-replace-tabs` (the Replace under its Web Lock) and `r82d-record` passed in the strict run.

**Round 81's C findings**
- **C1, the share card after a deploy:** fixed. `ShareCard.svelte` catches the failed import and offers a reload.
- **C3, the search-route tests:** they now find a corpus. Seven of seven ran over round 77's real corpus via `CULTIFOLIO_TEST_CORPUS`.
- **C4, the advisories:** fixed, apart from the four that wait for Kit 3.
- **C5, the sitemap:** unchanged. Another corpus id is still built fresh: 1.35 s against 0.18 s for a held copy. It is moot on Workers Paid.
- **C6, the plants list at scale:** better (below).

**Routes and errors** (`C-s/live/`)
- **Headers.** HSTS, nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and the Permissions-Policy are on every answer, redirects included. The private pages carry `X-Robots-Tag`.
- **Held pages.** Species pages and `/` are `private, max-age=60` and held (`x-cultifolio-page: held` on a repeat).
- **Errors:**
  - A missing page is a 404 with `public, max-age=300`, not kept at the edge.
  - `/species/Echeveria-Elegans?x=1` is a 301 to the slug, query kept.
  - A genus address is a 302 to its catalogue row.
  - `/species/%3Cscript…` goes to a slug.
  - A malformed `%ZZ` is refused by Cloudflare (400) before the Worker.
- **The APIs:**
  - **The reference APIs** (search, rows, sheets, entries): `public, max-age=86400` under `c=`, and `no-store` without it or under another id.
  - **Search:** out-of-range `n` and `at` are clamped, a 5,000-character query is cut, and invalid UTF-8 is an empty list.
  - **Sheets and entries:** a wrong bucket count is a 409; bad buckets are a 400.
  - **Names:** at most 80 characters.
  - **The dossier:** a GBIF key is a 302 to its page id, `no-store`. An unlisted `g2695104` (one of the 18 in the bucket) is a 404.
  - **Corpus:** `/api/corpus` is `no-store`.
- **The worker and the manifest.** `service-worker.js` and the manifest are `max-age=0, must-revalidate`; the maps are a day.
- **No 500 anywhere.**

**Corpus mid-upload.** Read, not run: `dossiers.ts` lines 287 to 320 still adopt a manifest only when its index and genera are in the bucket.

**Privacy.** Observability is off in `wrangler.jsonc`. No server `console.*` prints an address, a path or a query (all 40 read). The cookies are units and hemisphere only (`site.svelte.ts`, `units.svelte.ts`), with `Secure` over HTTPS. Edge copies match /about/how's "What the site knows about you" for every route I fetched.

**Sync, from the code and tests.** Round 82 changed only the /24 window (`windowNetwork`, for index, sync and syncobj), the 405 and the comments. `authed` compares SHA-256 token hashes. Every sync unit file passed.

**The device database at 2,000 plants and 20,000 entries** (`C-s/db/{desktop,phone}.json`; 77,040 changes):

| Step | Desktop | Pixel 7, CPU 4× | Round 81 (desktop / phone) |
|---|---|---|---|
| My plants, first open | 2.3 s | 4.7 s | 2.5 / 7.3 s |
| My plants, after | 0.70 s | 2.5 s | 0.96 / 4.4 s |
| Search "lithops" | 0.12 s | 0.44 s | 0.2 / 0.7 s |
| A plant page | 0.33 s | 0.91 s | 0.42 / 1.3 s |
| Today | 0.73 s | 1.3 s | 0.82 / 1.8 s |
| Backup (780 kB) | 1.4 s | 5.2 s | 2.3 / 8.9 s |
| Two tabs: a new plant seen | 75 ms | 31 ms | 25 / 174 ms |

Nothing was lost. The storage was 12.8 MB, not persisted. The machine's load was lower than in round 81's run, so part of the gain is the machine.

**The suites**
- **Unit:** 534 files passed, 4,796 tests, 3 skipped (two by design in `r79f-about-how`, one audit in `r61q`), 642 s. The slowest file is `r81b-fill-network` at 55 s.
- **Browser, strict** (`CI_STRICT=1`, `--workers=2`, port 4791, Chromium and phone): 693 passed, 5 skipped, 0 failed, 0 flaky, 18.2 min (`C-s/e2e/e2e.log`).

## Not checked, and why

- **Live CPU and memory of the Worker at 48,357 pages.** That needs the dashboard or `wrangler tail`. My timings include this workspace's proxy, about 0.2 to 0.3 s.
  - One `HEAD /api/index` took 80 s at 21:27 and 2.2 s on a retry. It did not repeat, so it is not reported.
- **WebKit.** Not installed here.
- **Sync against the live server.** Forbidden. Reviewed from the code and the unit tests.
- **A sync engine in a second tab during a Replace.** Its lock (`cultifolio-sync:<id>`) is not the Replace's. I did not trace whether its pull is refused by the switch's flag.
- **Browser specs on reverted builds.** Only unit tests ran on the reverts.
- **The plant page's species card offline after a deploy, live.** Locally the fixture's sheets were not kept.

## Needs from the PC

1. **The lost press in WebKit, traced.** In the project folder, with WebKit installed:
   ```
   set PW_WEBKIT_TRACE=on
   npx playwright test tests/e2e/smoke-1.spec.ts -g "labels: pick plants" --project webkit --repeat-each 30 --retries 0 --workers 2
   ```
   For a failed run, paste back from its trace (`test-results\…\trace.zip`, opened with `npx playwright show-trace`):
   - the click action's "before" and "after" snapshots of the Add button;
   - the console;
   - the timing of the `/api/search` and `/api/names` requests against the click.

   In Chromium the same steps never lost a press (C2).
2. **C1 in Safari on the iPhone, by hand** (a minute; nothing is saved):
   1. Open https://cultifolio.com/plants/new.
   2. Type "Haworthia", then tap the page's heading to close the keyboard.
   3. Wait a second; the list should appear over the form.
   4. Tap where "Space" was. Say whether the name changes to a species.

## Files

- **The work folder:** `/tmp/claude-0/rev84r/C-s/`:
  - `req.sh` and `reqlog.txt` (the live requests);
  - `live/` (headers and bodies; `m/` the merged addresses);
  - `race/` (`race.mjs`, `menu.mjs`, `menu2.mjs` and `live.mjs`, with their JSON and screenshots);
  - `sw/` (`update.mjs`, `update2.out` and `link.mjs`);
  - `db/` (`scale.mjs` and the results);
  - `unit/vitest.log` and `vitest.json`;
  - `e2e/e2e.log`;
  - `revert/files.tsv` and `r82.tsv`;
  - `perf/search-cold.tsv`;
  - `deps/audit-*.json`.
- **The copies:** `code/` (r84r), `r82/` (`c97d40e`) and `rv/` (the revert copy, restored).
- **`/tmp/claude-0/rev84r/code`** was not changed.
