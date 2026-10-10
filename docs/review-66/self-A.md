# Reviewer A: the example collection, the first visit, the phone and the tab bar

Scope: the review brief's section 1 (the example collection and the first visit), section 2 (the phone and the tab bar), and rule 4 where it touches the example. Working copy `/tmp/rev66/A`, server at `http://127.0.0.1:4173` (offline fixture corpus), Chromium 1194 headless, Node 22.22.2, Linux.

**How the probes run.** In this copy, `npx playwright test` loads the original checkout's Playwright for an ESM spec (`/home/claude/cultifolio/node_modules/playwright/lib/common/index.js`, beside this copy's own), so every spec fails with "did not expect test.use() to be called here". The existing specs fail the same way: `r63v-visitor.spec.ts --list` finds 0 tests. The probes are therefore standalone scripts on the Playwright library, in `tests/e2e/probes-A/`. Each prints PASS or FAIL against what the docs claim, and runs with `node tests/e2e/probes-A/<file>.mjs` from `/tmp/rev66/A`. A FAIL is a finding that reproduces on the current build.

Severity: **High** means a first visitor meets it in normal use. **Medium** means a privacy-rule or data claim is broken in a reachable sequence. **Low** covers the rest.

---

## 1. High. The example takes in a visitor's real first plants, places and batches, and its own words point them there (CONFIRMED)

- **Where:**
  - `src/lib/ui/grow/ExampleOffer.svelte:31-53`: an empty Today, Places or Propagation goes into the example by itself.
  - `src/lib/ui/grow/DemoBar.svelte:82`: the bar's words.
  - `src/routes/plants/new/+page.svelte:215`: the add form's heading.
  - `src/routes/species/[slug]/+page.svelte:386`: "Add one to my plants".
  - `src/routes/+layout.svelte:173-177`: the top bar's "+".
- **What it does.** Once the example is open, the whole tab is in it until Leave. That includes Back, every tab and the species pages. A first visitor who arrives on Today by tapping the tab then does the obvious next thing: finds a species and presses "Add one to my plants", or presses "+".
  - The add form is headed "MY PLANTS / Add a plant".
  - Over the form, the bar says "**Your own starts when you add a plant.**" and offers a second button, "Add your first plant".
  - The plant they type goes into the example, numbered after its twelve (2026-0007).
- **What happens to it.** On Leave, or on the bar's "Add your first plant", they are asked "The N records you added or changed here are deleted with it". Nothing offers to keep them. If they press the bar's button with the form filled, "Leave site?" throws the typed plant away.
- **Same path elsewhere.** Places' "+" ("Add a place") and Propagation's "Start a propagation batch" behave the same way after the Places or Propagation tab opened the example.
- **Reproduction:** `tests/e2e/probes-A/i-add-in-example.mjs`. The screenshot shows the bar's sentence above "Add a plant". `e-leave-count.mjs` (E2) shows Leave's deletion question after one watering. Both run on the current build.
- **What it should do.** Inside the example, any "Add" that starts a grower's own record should say where the record goes, or lead out of the example with what was typed.
- **Smallest fix:**
  - On `/plants/new`, `/propagation/new` and the Places add form, when `inDemo()`, show one line above the form: "This goes into the example and is deleted when you leave it."
  - Make that line's button leave with the form's fields in the address (`leave('/plants/new?species=…&key=…')`; the form already reads `species` and `key`).
  - Change the bar's sentence to "Nothing you add here is kept." and drop "Your own starts when you add a plant" on add pages.

## 2. High. "Empty" leaves out a frost site, species notes, a removed plant and a numbering scheme, so the example opens over them (CONFIRMED)

- **Where:** `src/lib/ui/grow/example.svelte.ts:29-32` (`ownEmpty`).
- **What it does.** `ownEmpty` counts live plants, batches, followed species, places, held and parked changes, and the sync key. Nothing else counts:
  - **A frost site** (`cultifolio.frost.site`, a 'collection' setting in localStorage). This is the frost watch the welcome line sells, and a visitor without plants can use it: Today's "Use my location", or Settings.
  - **A species' own notes** (a `taxon` record with `myNotes`, not followed), written from a species page.
  - **A removed plant**, still in the log and restorable.
  - **The numbering scheme** set in Settings.
- **What a visitor meets.** Someone without plants sets their site to use the frost watch, then opens Today in any new tab. They land in the example, whose frost section says "**No site set.** Use my location…". That contradicts what they just did, and it happens in every new tab, because `sampleOut` lasts only for the tab.
- **Reproduction:** `tests/e2e/probes-A/a1-empty.mjs`. Cases A1 (site), A2 (species notes), A3 (removed plant) and A4 (numbering scheme) all FAIL: the example opened (`demo=1`) and its frost watch said "No site set".
- **What it should do.** Not empty when the grower's own log folds to anything, or when a collection-scoped setting is set.
- **Smallest fix:** in `ownEmpty`, replace the four list checks with `collection.state.size === 0`. `state` holds removed records too, so it covers A2 to A4. Add `&& !localStorage.getItem('cultifolio.frost.site')`, read outside the example, and keep the held, parked and sync terms.

## 3. Medium. Leave in one example tab strands a second one: it keeps showing the example with the flag gone, re-creates the deleted database, and asks the browser to keep data from the example (CONFIRMED, stock Chromium)

- **Where:**
  - `src/lib/db/vault.ts:150-155` (`blocking`: `close()`, then `dbp = null`, then `sampleClosedHere()`).
  - `src/lib/db/demo.ts:105-110` and `:258-269` (`sampleClosedHere` sets `location.href='/'` and clears the flag first).
  - `src/lib/db/vault.ts:49` (`DB_NAME` is fixed for the page's life).
  - `src/lib/ui/grow/GrowLayer.svelte:27-44`.
- **Steps.**
  - Tab B is in the example, with a plant typed on `/plants/new`.
  - Tab A presses Leave.
  - B is sent home twice: once by A's "closed" message, once by the database delete's `versionchange`. Each time B's form asks "Leave site?". The visitor answers Cancel.
- **What B is left with.** B still draws the example and its bar, but `cultifolio.demo` is gone (`inDemo()` is false) and `sampleOut=1`. When B presses Add:
  - `openVault()` re-opens `cultifolio-demo`, re-creating the database Leave had just deleted, empty, and the plant is written there.
  - GrowLayer, which now reads "not in the example", calls `navigator.storage.persist()` from the example page and toasts "This browser has not promised to keep your data".
  - It writes the grower's own `cultifolio.persistAfterFirst=1` to localStorage. The grower's real first plant is then never asked about.
  - The plant is silently dropped by the next load's `dropLeftoverSample`.
- **Reproduction:** `tests/e2e/probes-A/d-two-tabs.mjs`. D1, D2 and D3 FAIL:
  - B ends as `{"url":"/plants/new","flag":null,"out":"1","bar":true}`.
  - The probe records `probe.persist=/plants/new:own`.
  - The databases afterwards are `cultifolio,cultifolio-demo`.
- **Smallest fix (also fixes 4):**
  - In `demo.ts`, read the flag once at module load (`export const PAGE_IN_DEMO = inDemo()`, as `vault.ts:49` does). Use it everywhere a reading means "which collection is this page showing": `stored.ts`, GrowLayer, the layout's hint, the sync engine and the persist ask. Keep live `inDemo()` only for "where does the next page go".
  - In `vault.ts` `blocking`, for the demo database, set a flag that makes `openVault()` reject from then on ("The example collection was closed in another tab"), so a stranded page cannot re-create it.

## 4. Medium. Leave answered Cancel where the browser does not report it: for 3 to 10 s the example page writes as the grower's own (CONFIRMED with the Navigation API removed; SUSPECTED in Safari)

- **Where:**
  - `src/lib/db/demo.ts:159-161` (`readyToLeave` removes the flag before the navigation).
  - `demo.ts:186-225`: `stay()` puts the flag back after 3 s if `prompted`, else after 10 s. Round 64 records that WebKit stayed "Leaving…" for the 10 s.
  - `src/lib/db/demo.ts:22-24`: `inDemo()` is a live read, but `vault.ts:49` fixed the database at load.
- **Steps.**
  - In the example, the visitor is typing on `/plants/new`.
  - They press "Leave the example", and "Leave site?" comes up. They answer Cancel and press Add before Leave is called off.
- **What happens.**
  - The plant saves into the example.
  - GrowLayer calls `navigator.storage.persist()` and toasts "This browser has not promised to keep your data…" inside the example.
  - It writes `cultifolio.persistAfterFirst=1` into the grower's own localStorage.
  - The same window sends any `writeSetting` to localStorage: a place picked becomes the grower's own `cultifolio.lastLocation`, a site the grower's frost site.
- **Reproduction:** `LOUD=1 node tests/e2e/probes-A/b-leave-cancel.mjs`.
  - B1 and B2 FAIL: `cultifolio.persistAfterFirst` was written, and the probe records `probe.persist=1@/plants/new:own`.
  - With the Navigation API kept (`NAV=keep LOUD=1`), all pass, because Chromium reports the Cancel as `navigateerror` at once.
  - The 10 s case in Safari's engine is from round 64's own account, not run here (no WebKit).
- **Smallest fix:** the one in 3. The page's collection decides the scope, not the tab's storage at the moment of the write.

## 5. Medium. Any page opened at `?left=sample` deletes an open example, and the visitor's edits in it, with no question (CONFIRMED)

- **Where:**
  - `src/app.html:15`: any load whose address has `left=sample` clears the flag and sets `cultifolio.sampleLeft`.
  - `src/lib/db/demo.ts:248-252`: `finishLeaving` deletes `cultifolio-demo` with no lock and no question.
- **Steps.** Tab A is in the example and the visitor has watered a stop. A new tab opens `/?left=sample`:
  - from a copied link;
  - from a bookmark;
  - from the history entry the visit was recorded under (the page takes the parameter off only by `replaceState`).
- **What happens.** A is sent home ("closed in another tab"), its database is deleted, and the edits are gone. Leave's "N records… are deleted" question never ran.
- **Reproduction:** `tests/e2e/probes-A/l-left-link.mjs`. L1 FAILs with `{"a":{"url":"/","demo":false},"dbs":["cultifolio"]}`.
- **Smallest fix.** In `finishLeaving`, delete only under `navigator.locks.request(OPEN_LOCK, { ifAvailable: true })`, the same test `dropLeftoverSample` uses. A real Leave has already told the other tabs to go, and a refusal leaves the delete to the next load's leftover sweep. Better still, honour `left=sample` in `app.html` only when the tab's own `cultifolio.sampleOut` or `sampleLeft` was set by `readyToLeave`, and use the address only as the fallback for the storage race it was added for.

## 6. Low. An empty Places with its add form open (My plants' first step, or Places' "+") shows the example's offer beside the form, and pressing it throws away a typed place name without a question (CONFIRMED)

- **Where:**
  - `src/routes/places/+page.svelte:120`: `hold` keeps it from opening by itself, but the offer is still drawn.
  - `src/lib/ui/grow/ExampleOffer.svelte:55-60` (`see()` makes a full load).
  - `places/+page.svelte` has no `onbeforeunload`, unlike `places/[id]`.
- **Steps.** On a fresh device, open `/places#add`, type "My greenhouse", then press "See the example collection".
- **Reproduction:** `tests/e2e/probes-A/m-places-add.mjs`. M1 FAILs: the form and the offer are both visible, the page goes into the example, the typed name is gone, and no dialog appeared.
- **Smallest fix:** draw no offer while `hold` is true, or have `see()` ask when a form on the page is dirty. The rest of the app's "a tap never loses typing" rule (round 63 fix pass R1, 1) would then hold here too.

## 7. Low. A seed cut off between its commit and its mark is never marked; the example is then seeded a second time once the visitor removes its plants (CONFIRMED from the cut-off state; the state itself not reached in Chromium)

- **Where:**
  - `src/lib/ui/grow/demo-seed.ts:123-134`: `seedOnce` returns early when plants exist, so the mark and the stamp missed by a reload are never written.
  - It also re-seeds when only the mark is missing and no live plant remains: the check reads `collection.accessions.length`, not the log.
  - `src/lib/db/demo.ts:117-138`: `sampleEdits` falls back to a rule.
- **Steps.** From an example whose `demoSeeded` and `demoSeedTop` are missing (what a reload between `putWith` and `setMeta(SEEDED)` leaves):
  - **K1:** the visitor waters seed plants on Today, then presses Leave. No question, and their waterings are deleted. This is the cost round 66 named, but it now lasts for good, not for a moment.
  - **K2:** the visitor removes all twelve plants and reloads. The seed runs again: 8 places (two Greenhouses, two Bench 1s, and so on), 24 plants, 2 batches. That breaks "a visitor who removed every plant keeps an empty sample" (`demo-seed.ts:105-106`).
- **Reproduction:** `tests/e2e/probes-A/k-cut-seed.mjs`. K1 and K2 FAIL; K2 reports `{"locs":8,"accs":24,"sows":2}`. The cut-off state is made by deleting the two meta keys. `j-reload-seed.mjs` reloaded at 10 offsets from 0 to 420 ms and always found a whole seed: in Chromium the window is a few milliseconds. In Safari's engine it is about three IndexedDB requests, roughly 50 ms at round 65's measured pace.
- **Smallest fix:**
  - In `seedOnce`, treat any change in the log (`(await changeKeys()).length`) as seeded.
  - If the mark or the stamp is missing, write both now, with the stamp being the largest `t` among the changes whose id ends in `sampleseeds0` or whose event `acc` does.
  - Use that same computed stamp as `sampleEdits`' fallback, in place of the rule that skips every edit to a seed record.

## 8. Low. "It never opens during a restore, merge, import or sync run" holds only in the tab doing the work (SUSPECTED, read)

- **Where:** `src/lib/ui/grow/example.svelte.ts:39` (`example.busy` is page state), `:56-58` (`working()` reads this tab's `busy` and this tab's `sync.busy`).
- **What happens.**
  - A "replace" restore writes the staging database first (`vault.ts` staged replacement), so the own vault stays empty until the copy.
  - A second tab opening Today in that time finds the device empty and goes into the example.
  - Nothing is lost, since the example has its own database, but the claim in REVIEW-ROUND-63 §2 and on the about page is broader than the code.
- **Smallest fix:** keep a "work in progress" mark shared by tabs. Either a Web Lock that `keepWorking` holds and `entersHere` probes with `ifAvailable`, or a meta key. Otherwise, narrow the words to "in this tab".

## 9. Low. At 320 px with 200% text, the example's bar is most of the first screen (CONFIRMED)

- **Measured** with `tests/e2e/probes-A/f-shots.mjs` on the example's Today:
  - 320 × 640 at 200%: the bar runs from 63 to 453 px, and the tab bar starts at 583.
  - The first stop starts at 963 px, nearly two screens down.
  - At 390 × 664, 375 × 548 and 360 × 640 the bar is 112 to 133 px and the first stop is in view (360, 360 and 402 px).
- **Smallest fix:** at large text, shorten the bar to one line ("Example collection: nothing here is yours") with its two buttons, or move "Add your first plant" into the menu while the example is open.

## 10. Low. Leaving the example from Labels writes the example's picked plant ids under the grower's own tab key (SUSPECTED, read; harmless today)

- **Where:** `src/routes/labels/+page.svelte:134-138`, `src/lib/db/demo.ts:159-161`.
- **What happens.** `readyToLeave` removes the flag before the navigation. The Labels page's `keep()` then runs at `visibilitychange` or `pagehide`, sees `inDemo()` false, and writes the example's ids to `sessionStorage['cultifolio.labelsPicked']`, not to `cultifolio.demo.labelsPicked`. Leave's `clearFlag` removes only the latter.
- **Why it does no harm yet.** The key is read only on a reload of the same Labels address, so nothing shows it today. It is a crossing in the "either direction" sense, and one more instance of the cause in 3 and 4.
- **Fix:** as in 3.

## 11. Low. A grower whose own collection is places only (or followed species only) is told the visitor's words in the example (read)

- **Where:** `src/lib/ui/grow/DemoBar.svelte:48`, `:82`, `:84`. `hasOwn` reads `cultifolio.hasMine`, which the layout writes from plants, batches and followed species (`+layout.svelte:263`), not places.
- **What happens.** A grower who set out their greenhouse and benches first, as My plants' first step asks, then opens the example from the menu. They are told "Your own starts when you add a plant" and offered "Add your first plant", although their collection has begun. A followed-species-only grower is told "Your own plants are kept apart, as you left them", though they have no plants.
- **Fix:** word the bar from `ownEmpty()`, read outside the example as the hint is, not from the plants-only hint.

---

## Incidental (outside my area; passed on)

- **One malformed stamp in the log leaves every private page at "Opening the collection…" for good.** The only trace is an uncaught `bad hlc: …` page error. Found when a probe's writer tag had capitals (`…-rAaaaaaaaaaaaaaa`). Whether a backup or sync path can deliver such a stamp is for the records reviewer.
- **The species page credits a photograph that did not load.** On `/species/copiapoa-cinerea` (offline fixture, iNaturalist S3 unreachable), the hero shows the letter placeholder "C photograph did not load" with the credit "Its page · (c) grower0, some rights reserved (CC BY)" laid over it.
- **The same page shifts when its photographs fail.** Layout shift on phone sizes was 0.07 to 0.33, varying run to run (`h-cls-species.mjs`, `h2-species-shift.mjs`). The thumbnail strip collapses, "20 photographs ›" and the glance appear, and the action block moves up 21 px. The fonts are not the cause: with fonts on time it is the same. On the live site, with photographs loading, it may not occur. A visitor with a content blocker or a flaky network would see it.

## Checked and found sound

- **Leave asks only about the visitor's own work.** Viewing My plants, a plant, Places, a place, Propagation, a batch, Labels, Compare, a species page and Today asks nothing; one "Water 2 here" asks about 2 records (`e-leave-count.mjs`, E1 and E2 PASS). `demoSeedTop` was present in every normal seed.
- **Leave + Cancel at "Leave site?" in Chromium** (Navigation API) keeps a working example tab, with no leak (`b-leave-cancel.mjs` with `NAV=keep`).
- **Back and Forward through the cache** (Chromium with its back-forward cache turned on):
  - Back from the example reloads the front page in the example; there is no own page under the example's flag.
  - Back after Leave, and Forward again, stay outside the example; nothing loops back in (`g-bfcache.mjs`, G1 to G3 PASS).
- **Reloads during the seed** at 0 to 420 ms always leave exactly one whole seed (12 plants, 4 places, mark and stamp) in Chromium (`j-reload-seed.mjs`).
- **What the example tab cannot reach of the grower's.**
  - Channels: the vault's `BroadcastChannel` is per database (`${DB_NAME}-vault`), so example writes never wake the grower's tabs.
  - Sync reads its key from the example's own meta (none). `push` and `schedule` return in the example (`engine.svelte.ts:317`, `559`, `590`).
  - The hemisphere and units cookies are not written from the example (`site.svelte.ts:34`, `units.svelte.ts:36`).
  - The front page's and the layout's `hasMine` effects return before reading the collection in the example, so they never re-run there, even after the flag goes.
  - The persist ask in `collection.load` is skipped in the example.
- **The tab bar.**
  - It has the same five tabs everywhere, with no horizontal scroll at 390, 375, 360 and 320 @200% (scrollWidth equals the viewport).
  - It drops to the smaller label step at 360 and to icons at 320 @200%.
  - In forced colours, `a[aria-current='page']` keeps Highlight on HighlightText (`theme.css:544-551`).
- **The phone's first screen** (fixture corpus only).
  - The first catalogue row is above the tab bar at 375 × 548 and 390 × 664 in light and dark. Screenshots are in `/tmp/claude-0/shots/`.
  - Layout shift on the front page with web fonts held back 2.5 s is 0 to 0.001 at all four sizes.
  - Layout shift on the example's Today is 0.03 to 0.09, from the stops being re-laid at about 1.2 s.
- **Storage refused.** By reading: `enterDemo` returns false when `setItem` throws, `leftHere()` is true, so the page never opens the example by itself, and the offer says why.
- **A followed-species-only grower** is not "empty" (`mySpecies` counts followed taxa).
