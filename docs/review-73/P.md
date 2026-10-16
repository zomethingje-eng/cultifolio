# Round 73, agent P: the app and pages

Branch `r73` in `/tmp/claude-0/rev73/P`, on `r73base`. Five commits. No corpus step.

## Done

### 1. A lighter first visit: the service worker from the second page or the collection

- **What the code does now.** The layout registers the worker only when `registerNow` (`src/lib/ui/worker-gate.ts`) says so:
  - at once on a device that already has one (a controller, or `getRegistration()` finds one), so it keeps its worker and its update check;
  - at once on a page of the collection: `/plants` (the add form and `/plants/import` included), `/places`, `/propagation`, `/today`, `/sync`, `/labels`, `/backup`, `/frost`;
  - as soon as the device holds a collection (`collection.recordCount > 0`: a plant added, a species followed, a restore or an import merged, the example) or sync is set up, on whatever page that happens;
  - otherwise from the second page view on the device: a second page loaded in full, a reload, or a move inside the app to another address. The count is `cultifolio.views` in local storage (1 or 2, nothing else); without storage the page's own count stands.
- Once registered it behaves as before: the same code, moved into `registerWorker()`; `servedByOld` is still read as the page loaded. `/settings` is not a collection page. For the tests, `<html data-worker>` says `on`, or `deferred` once the collection and sync are read with none registered.
- **Files.** `src/lib/ui/worker-gate.ts` (new), `src/routes/+layout.svelte`.
- **Tests.**
  - `tests/unit/r73p-worker-gate.test.ts`: the rule, the count, one `register(` call in the layout, the about page naming the key. On r73base the module does not exist.
  - `tests/e2e/r73p-first-visit.spec.ts`, counted at a proxy in front of the server (`helpers/cut.ts`), so the worker's own fetches are seen in every engine:
    - **1:** a reader of one species page is sent no worker and no precache; a grower's first `/plants` is (the shells, `/offline`, a cache holding `/offline`). On r73base: "what the install would have fetched", 12 paths received where none was expected.
    - **2:** a move inside the app registers it, and so does a reload; a device that has a worker keeps it with its count cleared, and asks for `/service-worker.js`. On r73base: registered on the first page (`Expected: false, Received: true`).
    - **3:** Follow on a species page registers it there and then. A guard: on r73base it times out on the marker, since the base registers on every page.
- **Specs changed for the new rule** (they relied on "the first-ever load registers the worker"): three smoke tests now make a second page view (`/about/formats`, `/plants/new`, a reload of `/`) before waiting for the worker. Every other offline spec starts on a collection page and is unchanged.

### 2. The phone's catalogue opens on the collector genera

- **What is authoritative.** `scripts/specialist-genera.txt`, the list the derivation takes whole, which /about/how already names as "173 collector genera". The index carries no mark of its own. It is now read in one place, `src/lib/ui/ref/collector.ts`, which the species page's 404 uses too. 162 of the 173 are in the live index (6,364 species); the 11 others have no page.
- **What the code does now.**
  - The front page's load sends the ids, letters and species count of the genus catalogue's collector rows. These are the same at every chip, so rows fetched later from `/api/rows` are marked too.
  - The page whose address names no grouping and no chip is the collector view. On a phone (700 px and under), CSS hides the other genera, their letter headings and their letters. An opened row is always drawn.
  - The phone's chip row starts with "Collector genera, 6,364" and its own "All, 8,947" (`?by=genus`), so the rest is one chip away. The count line reads "162 collector genera · 6,364 species · all 1,321 genera".
  - On a phone, a row or a part opened in the collector view goes to `/?open=<genus>`, so the view is kept. The phone's strip follows the third collector row.
  - Without JavaScript a phone draws the same view from the server's HTML.
- **The desktop is kept as it was, by choice.** The server cannot tell a phone from a desktop without guessing from the user agent. The front page is held at the edge by its address (`hooks.server.ts`, not mine), so a page that differed by device would need a new key part and still misjudge tablets. So the view is chosen by width, in CSS, from one HTML that every device gets.
  - A desktop draws every row. It shows its own "All" and its rows link `?by=genus&open=…` as before.
  - A phone's `/?open=X` opened on a desktop is the same page `?by=genus&open=X` is.
  - The same change was not plainly right there: the desktop's first screen leads with the strip and the feature, and the review measured the phone.
  - The phone's chips are marked on by their own class (`phon`), so `.on` is still one chip at any width.
- **Cost.** About 2 KB more data per genus front page on the live corpus (162 ids); no new request, no new cache key.
- **Files.** `src/lib/ui/ref/collector.ts` (new), `src/routes/+page.server.ts`, `src/routes/+page.svelte`, `src/routes/species/[slug]/+page.server.ts`.
- **Tests.**
  - `tests/e2e/r73p-front.spec.ts`:
    - **1:** the phone opens on Copiapoa and Welwitschia with Refusia, its heading and its letter hidden, keeps the view when a row opens, and "All" brings Refusia back. On r73base: `toBeHidden` fails.
    - **2:** the same view without JavaScript. Fails the same way on r73base.
    - **3:** the desktop is unchanged. A guard, which passes on r73base.
  - `tests/e2e/r62w-shapes.ts` marks its live-shaped rows as collector genera, so the first-screen measurements keep measuring rows of the live shape.
  - Smoke's "a chip filters the grouped catalogue" clicks the visible "All".

### 3. The vault ceilings said as defaults

- /about/formats said "(200)", "(2,000)" and "among the 2,000". It now names the defaults and the variables, and says this site's may be higher. That holds whatever `SYNC_VAULTS_PER_DAY` and `SYNC_VAULTS_MAX` say.
- DEPLOY.md's sync lines (64, 66, 68, 93, 95, 105) do the same.
  - Line 64 now names the launch's values (1,000 and 20,000), says to set both before the announcement, and says a value that is not a whole number is ignored (`creationCeilings`).
  - Line 95: twenty networks spend the default day, a hundred the launch's.
  - Line 105: 20,000 vaults at 2 GB each could hold 40 TB.
  - DEPLOY.md's corpus sections state no ceiling, so there is nothing for K.
- **Test.** `tests/unit/r73p-ceilings.test.ts`:
  - the one sentence that states the ceilings, with the code's defaults;
  - the owner's values read by `creationCeilings`;
  - DEPLOY.md.

  On r73base: two sentences matched the filter, not one, and DEPLOY.md lacked the defaults wording.

### 4. The listing's 503 kept across reloads

- **What the code does now.** A listing refused with a wait of a minute or more (the vault's hour of listings) is kept in the sync record as `listingWait: { text, until }`, capped at an hour, as the kept 429 is.
  - Until it ends, no run in any tab lists, after a reload too. The run ends with the server's sentence and is scheduled for the rest of the wait.
  - Uploads still go.
  - A listing answered clears it. A wait under a minute is the run's alone, as before.
- `pull` is untouched (it is in the fold-rules hash): the gate and the keeping are in `runNow`, `keepListingWait` and `listingHeld`. `FOLD_RULES` and the hash are unchanged.
- **File.** `src/lib/sync/engine.svelte.ts`.
- **Test.** `tests/unit/r73p-sync-listing.test.ts` (r72e's harness):
  - the five-minute tick lists no sooner, and a push still lands. On r73base: `expected 2 to be 1`;
  - a reload lists no sooner. On r73base: `expected 1 to be +0`;
  - a wait under a minute is not kept.

### 5. The month strip says its shading once

- **What a reader heard.** On Rubus parviflorus a screen reader was read "the rainy season (no growing season read: nights below freezing)" eight times: in the list's name, after each of the six wet months, and in the key. A sighted reader saw it once, in the key, with the sheet's lead under it.
- **Now:**
  - the list's name says it once ("Months, January to December; shaded: …");
  - each shaded month says ", shaded";
  - the key, the same words drawn as a legend, is `aria-hidden`.
- `seasonStrip` is unchanged, so what the rule reads is unchanged, and r72f's test of it still passes.
- **File.** `src/lib/ui/ref/Glance.svelte`.
- **Test.** `tests/unit/r73p-season-strip.test.ts` renders the card with `svelte/server`. On r73base: 8 times where 1 is expected, and 0 months saying "shaded".

### The about pages (written here, since they are mine; each checked against the code)

1. /about/how, the privacy list.
   - **Replaced:** "When a page loads, the app's service worker asks this site whether a new version is out (…)"
   - **With:** "The app's service worker, which keeps the app on the device for use without a signal, is installed from the second page this device opens on the site (a page loaded in full, a reload, or a move inside the app to another address), and at once on a page of your own collection (My plants, Places, Propagation, Today, Sync, Labels or Backup, an import among them) or as soon as the device holds a collection (a plant added, a species followed, a backup restored, sync set up). A visit of one page of the reference installs nothing, and nothing is fetched for offline use. The install fetches the app's own files (its scripts, styles, typefaces, icons and maps), the collection's pages, the offline page and the front page, once. From then on, when a page loads, the worker asks …"
   - **Checked against:** `registerNow`, `COLLECTION_PATH` and `PRECACHE`.
2. /about/how, the full detail. After "once each time a page is loaded in full;" it adds: "the worker is installed by the first of these pages a device opens, if a second page had not installed it already, and its install fetches the app's own files, the collection's pages, the offline page and the front page, nothing of yours;".
3. /about/how, the local-storage keys: adds `cultifolio.views` ("1 or 2: whether this device has opened a page of the site before, so the service worker is installed from the second"). The r62w seam test finds it in the code.
4. /about/how, the cache storage: "once the service worker is installed (above), the app's own files and the species pages you have opened since, for offline use".
5. /about/how, the plant address.
   - **Replaced:** "is fetched from the server on the first visit after the app is installed"
   - **With:** "is fetched from the server when that page is loaded in full before the service worker is in place on this device (that first page of your collection installs it)".
6. /about/how, the species list. Adds: "On a phone the front page's catalogue opens on the genera of that list, and every other genus is under its chip “All”; a wider screen shows every genus at once."
7. /about/formats, the ceilings.
   - **Replaced:** "among the day's new vaults (200) and among the vaults the site holds in all (2,000)"
   - **With:** "among the day's new vaults and among the vaults the site holds in all (200 a day and 2,000 in all by default; a deployment may set others in the Worker's variables `SYNC_VAULTS_PER_DAY` and `SYNC_VAULTS_MAX`, so this site's may be higher)".
   - "among the 2,000" becomes "among the vaults in all".
8. /about/formats, the listing 503.
   - **Replaced:** "the device receives again then"
   - **With:** "the device keeps a wait of a minute or more in its sync record (an hour at most), so no tab of it and no reload lists again before then, receives again then".
9. **Unchanged, and still true:**
   - "The service worker keeps those answers under the corpus id": this is about a grower's own pages, which register the worker.
   - The install bar's "works on the bench without a signal": the bar comes on the second day, after a second page.
   - The offline page's sentence: only the worker serves it.

## Needs

None.

- `hooks.server.ts`, `/api/rows` and `src/lib/server` are untouched.
- DEPLOY.md's corpus section states no ceiling.

## The corpus step

None. Nothing here reads or writes a dossier, the index or the manifest. The collector ids are derived from the catalogue's rows on each load.

## Measured

**First visit, Chromium, before and after** (`/tmp/claude-0/rev73/P-work/firstvisit.cjs`): one fresh context per page on the local test server (the fixture corpus, outside photographs unreachable); every request the context saw, the worker's included, until four quiet seconds; bytes are body plus headers as wrangler dev serves them, uncompressed.

| Page | Requests before → after | Worker's before → after | kB before → after | Worker registered |
|---|---|---|---|---|
| Front, desktop | 224 → 55 | 169 → 0 | 1,083 → 376 | yes → no |
| Front, phone | 225 → 55 | 170 → 0 | 1,083 → 376 | yes → no |
| Species, phone (Copiapoa cinerea) | 229 → 59 | 170 → 0 | 1,202 → 600 | yes → no |
| 404 | 204 → 34 | 170 → 0 | 1,091 → 225 | yes → no |
| My plants, phone (a grower's first page) | 224 → 225 | 169 → 170 | 1,083 → 1,085 | yes → yes |

**Runs (strict Chromium and the Chromium phone):**

- The whole of smoke with the offline, first-visit and front-page specs (r64f, r64w, r67h-offline, r69p-takeover, r60-grow, r63v-visitor, r67h-budget, r63fv-front and -guard, r61w, r62ba, r62w, r62bw, r63v-first-screen, r63h-phone, r71f, r72f, r73p): 246 tests, 245 passed. The one failure, smoke's "round forty" chip test meeting two `.on` chips, is fixed (`phon`), and its group (51 tests by grep) then passed whole.
- **On r73base:** r73p-first-visit 1 and 2 and r73p-front 1 and 2 fail as quoted above; r73p-front 3 passes (a guard).
- **After the last change:** r73p-first-visit, r73p-front and r67h-offline, Chromium and the phone: 11 passed.
- **Unit and type checks:** the whole unit suite, 405 files: 3,846 passed, 8 skipped, none failed. `tsc --noEmit` is clean, and `svelte-check --threshold error` shows 0 errors in 1,180 files.
- WebKit and Firefox were not run (the owner's `--tier=app`).

## Not done, with why

- **The phone's view is chosen by width, not by the server.** A phone in landscape over 700 px, or a narrow desktop window, gets the other view. That is by design (see 2).
- **The "More of the 1,321 genera" link** under a phone's collector view keeps its words; with JavaScript the rows fill in as the reader scrolls.
- **r73p-first-visit 3 (Follow registers) is a guard.** The base registers on every page, so it can fail on the base only by the new marker.
- **The live site was not measured after the change.** The figures above are the local server's, before and after, on the same fixture.

## Addendum (the coordinator's second message)

### 6. The toast's Undo on a slow device

- **What the code does now.** `ToastBar` records when a navigation begins (`beforeNavigate` → `toast.navigating()`). `onNavigate` hides only a toast raised more than 600 ms before that moment. A toast raised with its own navigation (the plant, batch and place removals, the single add) rides along however slowly the next page draws; an older one still goes.
- **Files.** `src/lib/ui/toast.svelte.ts`, `src/lib/ui/ToastBar.svelte`.
- **Tests.** `tests/e2e/r73p-toast.spec.ts`:
  - **1:** the removal with `history.pushState` held 800 ms and the clock not held. The toast is read and its Undo brings the plant back. On r73base: `Received string: ""`.
  - **2:** a guard. A toast 1.2 s old goes at an unrelated navigation.
- **About pages.** No sentence states the toast's rule.

### 7. K's `occurrences.keys` on the species page (K's need 2; coded to K's shape, typed locally so the merge joins)

- **(a)** Beside the records, under "Other GBIF keys": "Records also from GBIF's key {key} ({name}): {kew}; {n} records, from GBIF's download | GBIF's search API on the day of the build." The key links `https://www.gbif.org/species/{key}`, and "1 record" is singular. Nothing is shown without the field.
- **(b)** "Your plants" also joins on `taxonKey` equal to any `keys[].key`, and on `speciesSlug(taxonName)` equal to any `keys[].slug`.
- **(c)** The notes and the follow state kept under each `keys[].slug` are shown in the Cultivation section, headed "Under the old name {name}".
- **About pages.** These take K's need 3 and need 4 as K wrote them (already narrowed to homotypic names).
  - /about/how gains the records paragraph and the merged-pages sentence, ending "a plant recorded under the old name or under any key the page reads is listed among yours on the page, and your notes and following kept under the old name are shown there under it".
  - /about/how's photographs sentence gains its clause.
  - /about/formats gains the `occurrences.keys` field.
  - **For the merge:** if K changes those sentences in fix-K.md after this, take K's final words for the parts before my last clause.
- **File.** `src/routes/species/[slug]/+page.svelte`.
- **Tests.** `tests/e2e/r73p-other-keys.spec.ts`:
  - The field is put into `__data.json` on a client-side visit.
  - **1:** both keys' sentences and the link; three plants joined by key, by old address and by the second key; the old name's notes and follow. On r73base: "element(s) not found".
  - **2:** a guard. With no field, nothing is drawn.

### Runs

- **Strict Chromium and the phone,** two workers: r73p-toast, r73p-other-keys, r61l-records, r60-grow, r67r-places, r62a, r62ba, r62s, r61a, r71f, r72f and the whole of smoke. 230 tests: 229 passed first time, one flaky.
  - The flaky test is smoke's "hovering a species link…", whose preload poll timed out under load and passed on its retry.
  - Repeated alone four times, with the toast tests, it gave 12 of 12.
- `tsc` and `svelte-check`: 0 errors. The about seam tests and r73p unit tests: 74 passed.
