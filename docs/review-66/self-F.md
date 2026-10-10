# Reviewer F: findings

Scope: (a) the triage-61 decisions and round 63 sections 2 to 8 and 13, checked against the code; (b) `/about/how` and `/about/formats`, line by line; (c) the five rules on the pages people see; (d) the first visit and the grower's UX.

Method: I read the code in `/tmp/rev66/F`, which is the commit under review. I fetched pages from the running fixture server with curl. Browser probes were plain Playwright library scripts against `http://127.0.0.1:4173` (Chromium, `/opt/pw-browsers/chromium`) in `tests/e2e/probes-F/*.mjs` in my copy. The test runner would not load specs in this copy: "did not expect test() to be called here", and the same happens in `/tmp/rev66/A`. I ran the real-corpus checks against `/tmp/rev66/corpus/v2`. `@axe-core/playwright` is not installed, so I wrote a small in-page audit in `tests/e2e/probes-F/lib.mjs`. It checks accessible names, alt text, duplicate ids, dangling aria references, nested interactive elements, heading order, landmark labels, horizontal overflow and target sizes. The only unit test I ran was `tests/unit/r62w-about-seams.test.ts`, which passed 32 of 32.

The findings are ranked by what a skeptical first visitor meets first, then by data loss, then the rest.

---

## 1. HIGH. Cloudflare Workers Logs is switched on, so every request's URL and query is logged. `/about/how` says the server does not log paths (rule 4). CONFIRMED (config)

- **Where:** `wrangler.jsonc` line 9: `"observability": { "enabled": true }`.
- **What the pages claim:**
  - `/about/how` "Full detail": "The server does not log paths; the number is never in a referrer."
  - `/about/how` "What the site knows about you": "The one thing the server keeps about a visitor is short-lived rate counters keyed by address … none holds a page, a name or a record."
- **What the code does:** with observability enabled, Workers Logs keeps an invocation log for every request. Per Cloudflare's documentation, that log holds the request's URL, method and `cf` metadata, and it is kept for days in the operator's dashboard. On this site that means:
  - `/api/search?q=<name typed into the species picker>`;
  - `/api/forecast?lat=<site>&lon=<site>&alt=…`, the grower's rounded growing site;
  - `/api/names?q=…`;
  - every `/api/sync/…?vault=<vault id>`;
  - the `/plants/2026-0001` shell fetch that `/about/how` itself admits;
  - `/compare/__data.json?s=…`.

  The `console.error` lines in `src/lib/server/sync.ts` go there too.
- **History:** `docs/DEVLOG.md` rounds 28 and 29 recorded this ("Observability is on in `wrangler.jsonc`, which the privacy page does not say"; "Observability was still on: the replace … had matched a one-line form"). It is still on, and the privacy text has since grown a sentence that says the opposite.
- **Reproduction:** `grep -n observability /tmp/rev66/F/wrangler.jsonc` prints `9:  "observability": { "enabled": true },`. No test or seam check reads `wrangler.jsonc`.
- **Fix, either of:**
  - set `"observability": { "enabled": false }`, or at least `"logs": { "invocation_logs": false }`, and add a unit seam test that fails while it is on;
  - or say on `/about/how` exactly what Cloudflare logs and for how long, and drop "The server does not log paths".

## 2. MEDIUM. The "keep data" question is asked on every full page load while it stays unanswered (Firefox). The monthly limit the pages describe does not cover the first-plant ask. CONFIRMED (simulated in Chromium)

- **Where:**
  - `src/lib/ui/grow/GrowLayer.svelte:26-35`. The first-plant ask calls `navigator.storage.persist()` whenever `cultifolio.persistAfterFirst` is not `'1'`. That key is written only after the promise settles and the answer has been shown (line 44).
  - `src/lib/db/vault.ts:613-617` says that in Firefox the promise "waits for their answer, however long that is (for good, if the question is dismissed)".
  - `askDue()` (`src/lib/db/collection.svelte.ts:58-67`) limits only the second ask, in `collection.load()`.
- **What the pages claim:** `/about/how` says `cultifolio.persistAskedAt`: "a page asks at most once a month … Firefox asks you, and no page waits for your answer". Round 64 says the question is asked "at most once a month".
- **Reproduction:** `tests/e2e/probes-F/f6-persist.mjs`. It stubs `persist()` with a promise that never settles (Firefox with the question left standing), adds one plant, then loads four pages. Output:

  ```
  after add http://127.0.0.1:4173/plants/2026-0001 [ '1', null, null ]
  after load /plants [ '3', null, '1791649532213', ... ]   <- two asks on one load (load()'s and GrowLayer's)
  after load /today  [ '4', null, '1791649532213', ... ]
  after load /plants [ '5', ... ]
  after load /       [ '6', ... ]
  ```

  `persistAskedAt` is set, yet every full load asks again. In Firefox each ask puts the question back in front of the grower. An installed app opened daily asks daily.
- **Fix:** have GrowLayer check and set the same `cultifolio.persistAskedAt` through `askDue()` before asking, or write `persistAfterFirst` when it asks, not when it is answered. Ask once per load, not from two places.

## 3. MEDIUM. 120 live species pages show two different "a year" rain figures. The Seasons card says "X mm a year" for the median year; the top says "Rain a year (median across the range)" with another number. CONFIRMED

- **Where:** `src/lib/core/sheet.ts:343` (`year.none`) and `:347` (`year.fog`): `Rain at the habitat is ${RAIN(year.annualMm)} a year (${ENV})`.
- **What the claims say:**
  - Round 63 §13 R2: "The sheet and the plant page say 'in the median year' wherever they give the median year's rain."
  - `/about/how`: "The cultivation sheet's Rain line and the season reading give the median year's total instead … named 'in the median year'."

  This sentence of the season reading still says "a year". The `short` and `lead` forms were fixed; the long sentence was not.
- **Reproduction:** `cd tests/e2e/probes-F && npx tsx sheet.ts /tmp/rev66/corpus/v2/8330171.json` (Boswellia sacra; the top card shows the dossier's `annualRain.p50` = 99 mm):

  ```
  Seasons "Its year": "Rain at the habitat is 56 mm a year (median year across the grid cells of the range, CHELSA). Under 120 mm ..."
  Rain: "56 mm in the median year ... The median of the cells' own yearly totals, 99 mm, is the year's rain at the top of the page"
  ```

  A Python count over the live corpus found 166 dry-habitat species that carry a p50. On 120 of them the two figures differ: Mesembryanthemum pellitum 63 against 68.5, Tylecodon rubrovenosus 67 against 75, Aloidendron dichotomum 114 against 133. The seam test "the season reading beside the glance card names its rain the same way" does not check the long sentence.
- **Fix:** in both branches, write `Rain at the habitat is ${RAIN(year.annualMm)} in the median year (…)`, and extend the seam test to `s`.

## 4. MEDIUM. `/about/how` says Ceropegia is not taken whole. The build takes it whole, and the live corpus has 700 Ceropegia species. CONFIRMED

- **Where:**
  - `/about/how` "Which species are here": "The very large genera are not taken whole, and only the species of theirs that reached the cultivated count are here: Aloe (9 species …), Euphorbia, Senecio, Oxalis, Dioscorea, Peperomia, Hoya, **Ceropegia**, …"
  - `scripts/specialist-genera.txt` line 3 says the same in its header, but line 199 lists `Ceropegia` as a genus taken whole (WCVP sinks Brachystelma and the stapeliads into it).
- **Reproduction (live corpus):** `python3 -c "…Counter(e['name'].split()[0] for e in index)…"` gives Ceropegia 700 and Aloe 9. The synonyms of those 700 are Brachystelma 157, Caralluma 66, Stapelia 60, Huernia 50, Orbea 45 and others.
  - Eleven of the "173 collector genera" have no species left in the corpus. Eight are stapeliads now under Ceropegia (Caralluma, Duvalia, Larryleachia, Pseudolithos, Quaqua, Stapelianthus, Tavaresia, Tromotriche); the other three are Neolloydia, Muiria and Sarcocaulon.
  - A visitor who opens the Ceropegia row finds the reverse of what the page says. The seam test "173 collector genera, as the file lists them" counts this line too, so it cannot catch the contradiction.
- **Fix:** take Ceropegia out of the "not taken whole" sentence, and out of the file's header. Say that the stapeliads and Brachystelma are included as Ceropegia under WCVP.

## 5. LOW (visible on a grower's first Today). "Use my locationor set your site in Settings": Svelte drops the space at the start of an `{#if}` block. CONFIRMED

- **Where:** `src/routes/today/+page.svelte:437`: `…</button>{#if !inDemo()} or <a href="/settings#site">…`. The same fault is in `src/routes/backup/+page.svelte:172`: `…the file says which.{#if sync.configured} Sync may still…`, which renders "which.Sync may still".
- **Reproduction:**
  - On `/today` for a grower with no site, `tests/e2e/probes-F/f3-texts.mjs` prints "No site set. Use my locationor set your site in Settings".
  - The compiler shows the cause: `compile('<p>…<button>Use</button>{#if x} or <a…>…', {generate:'server'})` emits `` `<!--[0-->or <a href="/s">` ``. Svelte 5 trims leading whitespace inside a block.
  - `grep -rnoE "\{(#if|:else if|:else)[^}]*\} [a-zA-Z]"` finds exactly these two, plus `backup:196`, whose `<b>` is a block, so it reads correctly.
- **Fix:** move the space outside the block (`</button> {#if …}or …`) or write `{' '}`.

## 6. LOW (privacy wording). Links on private pages are preloaded on hover: the compare tray outside `<main>` sends species slugs on hover. CONFIRMED

- **What the page claims:** `/about/how`: "links on these pages are not preloaded on hover, so a name goes only when you click".
- **What the code does:**
  - `src/app.html:18` sets `<body data-sveltekit-preload-data="hover">`.
  - `+layout.svelte:341` turns preloading off only on `<main>`.
  - The compare tray (`CompareBar`), the crumb and the frost bar sit outside `<main>`.
- **Reproduction:** `tests/e2e/probes-F/f7-preload.mjs` puts two species in the tray, opens `/plants` and hovers "Compare 2":

  ```
  tray link 1 /compare?s=copiapoa-cinerea,welwitschia-mirabilis inside main? false
  requests on hover: ['http://127.0.0.1:4173/compare/__data.json?s=copiapoa-cinerea%2Cwelwitschia-mirabilis&x-sveltekit-invalidated=01']
  ```

  The slugs were picked on public pages. What the server learns is the pairing with a private-page visit, and the sentence is not true.
- **Fix:** put `data-sveltekit-preload-data={privateRoute ? 'off' : 'hover'}` on `<body>` (in `app.html`, default `off`), or on the tray and the header too.

## 7. LOW. "Every key" is not every key: SvelteKit's own session keys are missing. CONFIRMED

- **What the page claims:** `/about/how` lists "What the device keeps outside the collection, every key".
- **What the browser holds:** after any visit, session storage holds `sveltekit:snapshot` and `sveltekit:scroll`. They are written by the framework, so the seam test, which walks the app's own `getItem`/`setItem` calls, never sees them.

  Separately, `/api/search` answers carry `public, max-age=86400`. The browser's HTTP cache therefore keeps every picker name and catalogue query for a day under its URL, and the device-storage list does not say so.
- **Reproduction:** `tests/e2e/probes-F/f1-tour.mjs` prints `"session": ["sveltekit:snapshot","sveltekit:scroll","cultifolio.sampleOut"]`. Also `curl -sD- "http://127.0.0.1:4173/api/search?q=aloe&n=5&c=fixture" | grep -i cache-control` gives `public, max-age=86400`.
- **Fix:** name both framework keys, and the HTTP cache of `/api/search`, on `/about/how`, or send `private, no-store` to the browser. Add the two keys to the seam test's list of framework writers.

## 8. LOW. `/about/how`'s list of sources leaves out Natural Earth and Wikidata, which the footer and every species page credit. CONFIRMED

- **What the page says:** "In brief": "built ahead of time from public data (GBIF, Kew's WCVP, CHELSA, ETOPO, NASA POWER, iNaturalist, Wikimedia Commons, Wikipedia, OpenAlex)". "What comes from where" never mentions Natural Earth (the map outline, `src/lib/map/still.ts`, `/maps/land*.svg`) or Wikidata (identifiers and links, `src/lib/dossier/sources/wikimedia.ts`).
- **What the rest of the site says:** the footer on every page reads "Sources: … ETOPO, Natural Earth, … Wikidata, …". The species page's provenance has a "Wikidata" row.
- **Fix:** add both, and say what each supplies.

## 9. LOW (first visit). The example's Today warns "Kept on this device: no backup yet, not synced." and links to a locked page. CONFIRMED

- **Where:** `src/lib/ui/Today.svelte:134-141` and `:173`. The `keeping` line is not gated on `inDemo()`, unlike GrowLayer's backup nudge.
- **What a visitor sees:** a warn-toned line about the example's data on their first look at Today (screenshot `phone-today.png` in my scratchpad). Its link goes to `/backup`, which the example shuts ("Backup and restore are off in the example collection").
- **Fix:** `keeping` returns null when `inDemo()`.

## 10. LOW (rule 2, latent). The genus summary says a refusal as "did not answer". CONFIRMED on the fixture, none live

- **Where:** `src/routes/species/[slug]/+page.svelte:450-452`. For `genusRecord.status === 'refused'` it hard-codes "Wikipedia did not answer for the genus". `scripts/build-dossiers.ts:263` writes `'refused'` both for a refusal and for an error. The species summary three lines above uses `notAnswered(status)`.
- **Reproduction:** `curl -s http://127.0.0.1:4173/species/refusia-testii` gives "Not checked. Wikipedia did not answer for the genus when this was built.", where the fixture's record is `"detail": "refused: en.wikipedia.org 503"`. None of the 1,321 live genus records is refused today.
- **Fix:** read `detail`'s prefix, or store `error` apart from `refused`, and use `notAnswered`.

## 11. LOW. The compare page has a doubled full stop. CONFIRMED

- **Where:** `src/routes/compare/+page.svelte:227`: `{climateWord(c.d)}.` appends a full stop to a sentence that already ends in one.
- **Reproduction:** `curl -s "http://127.0.0.1:4173/compare?s=copiapoa-cinerea,refusia-testii"` shows "…when the species page was built.." in the "The year" row.
- **Fix:** drop the literal `.`.

## 12. LOW (a11y). At 320 px with 200% text, the add form's sticky action bar and the tab bar cover 52% of the screen. CONFIRMED

- **Reproduction:** `tests/e2e/probes-F/f5-add.mjs`. On `/plants/new` at 320×640 with 200% text, `.actions` is sticky from 358 to 584 px and `#tabbar` is fixed from 583 to 640 px, so 283 px of 640 hold the bars and 51 px the top bar. The page heading and the form scroll under a three-button bar (screenshot `n/add-0.png`). The focused field is still visible (281 to 350 px), but on a phone the soft keyboard leaves almost nothing.
- **Fix:** the same short-screen rule select mode has (`max-height: 30em` lets it sit static), or one row of buttons with "Save and add another" moved to the menu.

## 13. LOW (visual, first example screen). Italic species names are clipped in Today's chips. CONFIRMED

- **What is seen:** "2025-0004 *Lithops lesliei* 16 d" draws as "Lithops leslie" with the final "i" cut, at 1280 px and at 390 px alike (screenshots `desk-today.png` and `chip.png`). The italic overhang is clipped by the name's `overflow: hidden`.
- **Fix:** `padding-inline-end: .15em` on the italic name inside the clipped box.

## 14. LOW, SUSPECTED. The example bar and the "Opening your plants…" placeholder are in the HTML of every public page

- **What is there:** CSS hides them (`html:not([data-demo]) .demobar`, `#shell`). Any reader that ignores the stylesheet shows "An example collection, so you can see what this page does. Your own starts when you add a plant." and "Opening your plants…" on every species page: curl text, text browsers, some reader modes, feed and preview tools. Seen in `curl -s /species/copiapoa-cinerea | <strip tags>`.
- **Fix:** add the `hidden` attribute server-side and remove it in app.html's first script, or render the bar only when `html[data-demo]`.

---

## Triage-61 decisions and round-63 items I checked

| Item | Status | Note |
|---|---|---|
| T1 species `[slug]/+layout` `{#key}` and leave guard | done | layout present; r62bw seam |
| T1 sample Leave navigates first and asks with a count | done | `demo.ts` `leaveDemo` and `sampleEdits`; probe saw `?left=sample`, then deletion |
| T2 Today: sheets failed, unasked slugs, 5 s "Still reading", 15 s give-up | done | `today/+page.svelte:114-134,356` |
| T2 plant page "Name not in the reference" for `none` | done | `plants/[acc]:608` |
| T2 picker 400, 429 and held 503 said as "not asked" | done | `SpeciesPicker.svelte:70-80,302` |
| T2 photo sources "refused" and "skipped" | done | seam test |
| T2 genus summary (same class as A35) | different | finding 10 |
| T3 search order, X-Search-Relaxed/Left/Near, hybrid, sp., quotes, ZW characters | done | curl probes |
| T3 `/about/how`: first four names, semicolons, tie-breaks | done | matches `englishNames` |
| T3 ENGLISH_USE list on `/about/how` | done | the ten words match `index-entry.ts:67` |
| T6 shares 600, a tenth, four tenths, reserve, 77 networks | done | `caps.ts`, `counters.ts:653-670`; arithmetic holds |
| T6 busy photograph 10 s; sweep 100 a run; seven nights; marks | done | `sync.ts:165`, `counters.ts:712-716` |
| T8 5167 margin 7.62 mm; calendar SEQUENCE and UID | done | `labels/+page.svelte:41`, `export/ics.ts:141` |
| T8 `/plants` sheet download by dynamic import | done | `PlantsMenu.svelte:33` |
| T9 italic `@font-face` out of `{@html}`; no-referrer | done | `referrer-policy: no-referrer` header and meta |
| T9 link preview "typical spot", no "in the wild"; `/compare` description | done | curl of meta tags |
| T9 `/about/how` requests, all of them | half done | the requests list is right, but findings 1, 6 and 7 |
| T9 `/about/how` "every key" | half done | finding 7 |
| T9 seam test, both ways | half done | no check of framework keys, `wrangler.jsonc`, preload scope, the season sentence or the genus file's contradiction |
| T10 bundle gate after every build | different | from `attach-do.mjs`, not `postbuild`; same effect |
| T11 deletions (grow barrel, `clearSampleSettings`, `upstreamAllowed`, `dbg-proxy`) | done | none found |
| R63 §2 five tabs; Compare and About in menu and footer | done | probe |
| R63 §2 "example" in every user-facing word | done | no user-visible "sample" found |
| R63 §2 bar wording; own-plants variant; empty states with two ways on | done | `DemoBar.svelte`, f3 texts |
| R63 §2 example never shows backup state | missing | finding 9 (not claimed, but implied by the locked pages) |
| R63 §3 comma lists, bare genus, case rule | done | read `englishNames`, which matches `/about/how` |
| R63 §4 rain median labels | half done | finding 3 |
| R63 §4 tile credit, licence first, 40 characters | done | `head.ts:131-157`; 4,739 live entries carry a credit, 15 longer than 40 characters, cut at a word |
| R63 §4 sitemap per-species day | done | `sitemap.ts:42-81` (fixture has no days) |
| R63 §5 `w` display only; earlier `w` kept; backup v3 | done | grep of folds; `vault.ts:405`; `backup.ts:124,238` |
| R63 §6 /24 shares; reserve wording on `/about/how` | done | strings match `sync.ts:1484-1492` |
| R63 §6 frost notifications closed and said | done | `/about/how` |
| R63 §7 spreadsheet readings said on formats | done | |
| R63 §13 R1 load into the example called off: flag taken back | done | `enterDemo` |
| R63 §13 R2 "in the median year" wherever | half done | finding 3 |
| R63 §13 R3 reserve words; carrier NAT sentence | done | |
| R64 persist "at most once a month, never waited for" | half done | finding 2 |
| R64 self-reload rule (older worker and a different build only) | done | `+layout.svelte:223-231`, `service-worker.ts:58-63`; a tab whose takeover another tab started never reloads and runs on until a failed navigation |

## What I checked and found sound

- **CSP and hosts:** the CSP header and the meta tag on prerendered pages both match app.html's inline script hash, recomputed from the served HTML (`GHv5…`). `img-src` names exactly the four image hosts `/about/how` names. `connect-src`, `font-src` and `script-src` are `self`. The browser probe saw requests only to the site and `inaturalist-open-data.s3.amazonaws.com`. No `Set-Cookie` is set anywhere on the server. The only cookies are `cultifolio.units` and `cultifolio.hemi` (path `/species` and `/compare`), and none is written from the example.
- **Storage keys:** every `localStorage` and `sessionStorage` key the app code writes is on `/about/how` under the right store. The `cultifolio.demo.*` list on `/about/formats` matches what `stored.ts` callers can write in the example. The IndexedDB, cache, lock and channel names match.
- **Edge caches:** sheets and entries for a day, pages for 60 s under the Worker's key, the forecast for 3,600 s or 300 s, the dossier `no-store`, `/api/corpus` `no-store`, 404s `no-store`.
- **Forecast:** rounding (`toFixed(2)`, 10 m), half an hour in session storage, five minutes when the NWS alerts failed, a 10 s timeout, the 5-minute timer while visible.
- **Front feature rule** (48 genera, eight photographs or more, `open` sort, 12 a day) and the 173-line count. The Aloe 9 is true live.
- **QR name cut** (60 code points by grapheme, `Cf` removed but a ZWJ in emoji kept, two marks at most, lone surrogates replaced); photograph sizes 1600 and 320; DB version 4; clock thresholds (5 min, 30 s, 2 days, a week).
- **Rule 2 on the refused and pending fixture pages:** "not checked", "refused", "Not a statement that none exist" throughout, apart from finding 10.
- **Rule 5:** `w` is never read in a fold, hold or park. `collection.load()` writes only the snapshot and meta. I found no read path that appends to `changes`.
- **Accessibility:** across 17 pages, in light and dark, at 390 px and at 320 px with 200% text, my in-page audit found:
  - no unnamed controls, missing alt text, duplicate ids, nested interactive elements, heading jumps or page-level horizontal scroll;
  - `aria-controls="menu"` and `"card-menu"` point at elements that exist only while open, which axe accepts with `aria-expanded="false"`;
  - the `/about/how` contents links are 16 px tall, separated by "·" on a 2.0 line height, which is borderline for WCAG 2.5.8;
  - one region label, "From the reference", is used twice, but one copy is display:none at each width.
