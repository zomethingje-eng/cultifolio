# Review prompt, round six

Paste everything below the line to the reviewing model. Give it the repository (`https://github.com/zomethingje-eng/cultifolio`, commit `d728123` or later), a checkout with `npm install` done if it can run code, and the live site `https://cultifolio.jefarn.workers.dev` (the real corpus, 8,947 species; the checkout serves a three-species fixture corpus). The previous rounds are `docs/REVIEW-ROUND-4.md` and `docs/REVIEW-ROUND-5.md`; the engineering log is `docs/DEVLOG.md`, and the last eight entries are the ground this round covers.

---

You are reviewing Cultifolio, a SvelteKit 5 application on Cloudflare Workers: a species reference for cactus, succulent and bulb growers (8,947 species, each with a page derived from public data: GBIF, Kew's WCVP, CHELSA, NASA POWER, iNaturalist, Wikipedia) and a private collection tracker that lives in the browser, synced end-to-end encrypted when the grower chooses. It is about to be posted to Show HN.

This is a sixth round. The first five were adversarial reviews of the data path, the derivations, the collection and the sync layer, and their findings are closed. This round is different in emphasis: since round five the app grew the whole layer a visitor meets first, and nobody outside the author has walked it. Review it as three people in turn: a first-time visitor who grows plants, a QA engineer, and a code reviewer. Reproductions, not impressions.

## The rules the project holds itself to

A claim the code does not keep is a finding.

1. Every figure on a species page states its source. Nothing on a species page is written by a person or a language model: every sentence is a quoted source, a figure with its source, or a labelled reading of a fixed rule.
2. A refusal is not an absence. A source that did not answer is "not checked", never "none".
3. Nothing derived is smoothed, guessed, or inferred beyond what the rule states.
4. The collection is the grower's alone: on device, synced only if they set it up, encrypted so the server never reads it. No accounts, no analytics. Settings that are about the person (units, site, appearance) stay on the device; one setting of the vault (numbering) syncs.
5. Units: everything stored, exported and derived is metric. Display is the reader's choice, °C/mm or °F/inches as one preference, guessed from the browser on a first visit (en-US is Fahrenheit) and kept in a cookie. A sentence is never half converted; a temperature difference converts without the offset; a rule's metric threshold stays beside its conversion.

## What changed since round five (look here hardest)

- The front page: the catalogue is closed rows grouped by genus (default), origin or family, one open at a time and in the URL (`?by=genus&open=copiapoa`), an A–Z bar, search that flattens the catalogue. `src/routes/+page.server.ts`, `src/routes/+page.svelte`, `src/lib/core/search.ts` (per-word prefix, genus ranked first, one typing error forgiven only when the exact spelling finds nothing).
- A menu behind the mark in the top-left corner reaching every page; `src/routes/+layout.svelte`.
- The species page in reference order: hero and name; Summary (Wikipedia lead); About the genus (the genus's Wikipedia lead, from `s/v2/g/<slug>.json` written by `--fill genus`); a fact strip; four figures and the rule-derived note under "At a glance"; the cultivation cards as an accordion (native `<details>`, first open); climate with the climograph; habitat; photographs; Related ("grows like": the six nearest habitat climates by one stated distance in `src/lib/core/near.ts`, computed at index time into `index.json` as `near`; and the rest of the genus); registers. `src/routes/species/[slug]/`.
- `/compare?s=a,b,c`: up to three species side by side; a tray in local storage. `src/routes/compare/`, `src/lib/ui/compare.svelte.ts`, `CompareBar.svelte`, `CompareButton.svelte`.
- "Share card": a 1200×630 PNG drawn in the browser from the climograph geometry with the sources and the URL in it. `src/lib/share/card.ts`, `src/lib/ui/ShareCard.svelte`.
- Units: `src/lib/core/units.ts`, `src/lib/ui/units.svelte.ts`, `src/lib/server/units.ts` (cookie or Accept-Language), threaded through `sheet.ts`, `note.ts`, the climograph, the compare page, the card, the plant page, benches (floor entered in the reader's unit, stored °C), sowings (bottom heat), the frost forecast (`/api/forecast?units=`).
- `/settings`: units, your site (coordinates the frost watch, the front page's forecast line and the hemisphere of the months read; the frost page no longer has its own form), appearance (system/light/dark, applied before first paint by an inline script in `src/app.html`), numbering (year or prefix, digits, preview, saved as the vault's synced setting), links to your data. `src/routes/settings/+page.svelte`, `src/lib/ui/site.svelte.ts`, `src/lib/ui/theme.svelte.ts`.
- A grower's front page opens with "today": frost when the site's forecast turns, sowings in the tray, plants without a photograph in a year (`/plants?show=nophoto`). `src/lib/ui/Today.svelte`.
- An install bar after the second visit (`beforeinstallprompt`, or Safari's two taps), snoozed thirty days. `src/lib/ui/InstallBar.svelte`, `static/manifest.webmanifest`.
- The server-rendered pages (front, species, compare, settings) read the units cookie in their own `+page.server.ts` (`src/lib/server/units.ts`) and send `cache-control: private, max-age=60` with `vary: accept-language, cookie`. There is deliberately no root `+layout.server.ts`: the collection's pages are client-rendered and must open offline, and a root server load would make them fetch `__data.json` on load (that regression shipped for a day; `docs/REVIEW-ROUND-6.md` finding 0).

## What to do

Work in this order and report in this order.

### 1. Run it

`npm install`, `npm run test` (vitest, expect 265 passing), `npm run check`, `npm run build`, `npm run preview` (wrangler dev on 4173, the fixture corpus), `npm run e2e` (Playwright, 46 tests; the sync tests are known to be flaky under load, everything else should pass first time). Then use the live site for anything that needs the real corpus.

### 2. Be a first-time visitor

Do this on the live site, in a private window, once on a desktop and once on a phone (or at 390 px), before reading any code. Write down, in order, everything you did and every point at which you did not know what to do next, what a word meant, or why something was there. Specifically:

- Land on `/`. What do you understand the site to be within ten seconds? What do you click first? Do you find a species you know within a minute, and how (rows, letters, search)? Try a misspelling.
- Open a species page and read it top to bottom. Where do you stop reading? What does "At a glance" hold, and is "In short" clearly the rule-derived note and not the Wikipedia text? Is the accordion obviously an accordion? Does the fact strip repeat what the id card said? Does "grows like" mean what you thought?
- Tap a temperature. Did you expect the whole page to change units? Did anything not change? Look for a °C left behind anywhere on the site while in Fahrenheit (the plant page, a bench, the labels, the frost table, the share card, an `aria-label`, a `title`, the `<desc>` of the climograph).
- Add a plant, then go back to `/`. Say what you expected and what you got.
- Open the menu. Open Settings. Set your site. Is it clear what the site is for? Go to `/frost`. Then compare two species and download a share card.
- On the phone: is the tray in the way? Does the install bar make sense or look like an ad? Can you reach everything with a thumb?

Report this section as a narrative with timestamps or step numbers. The author wants to know where a stranger gets lost, not whether you personally liked it.

### 3. QA the new surfaces

Now break them. For each, the question is the same: what input, state, or sequence makes it wrong, and does the page then lie or say so.

- Search (`src/lib/core/search.ts`): names with hybrid signs (`× Graptoveria`), diacritics, hyphens, subspecies and varieties, one-letter queries, a query that matches only by origin, a typo in a four-letter genus, a typo that matches a *different* correct name (should the near miss show beside the exact hit? it is designed not to). Is the ranking stable and explainable? Is the picker's behaviour the same as the front page's?
- The grouped catalogue: `?by=` and `?open=` with junk values, a genus whose slug collides with another's, a group with one species, the "Family not stated" and "Origin not stated" rows, the A–Z bar on a phone, the back button after opening three rows in a row, no JavaScript.
- Units: every formatter in `src/lib/core/units.ts` (precision at the boundaries: 0.99 in, 9.95 mm, −0.04 °C, a 0.5 °C difference), every consumer (grep for `°C`, `mm`, `toFixed` in `src/` and say which are unconverted and whether they should be). The bench floor round trip (enter 40 °F, save, reload, edit: is it still 40 °F, and what is stored?). The cookie: set to garbage; set to `us` with a British Accept-Language; absent with no Accept-Language. The server render versus the client (`+layout.server.ts` seeds a module-level store on the server: can two concurrent requests in one isolate see each other's units?). The forecast risk text with `units=` absent, wrong, or set after the page loaded.
- The climograph in inches and Fahrenheit (`src/lib/climate/climograph.ts`): tick rounding, a 500 mm month, a habitat with no month over 1 mm, an axis that crosses 32 °F, the `<desc>`.
- "Grows like" (`src/lib/core/near.ts`, the `near` field of the index, `scripts/build-dossiers.ts` `scanDossiers`): is the distance what `/about/how` says? Is it symmetric? What happens to a species with a climate whose six nearest all lack photographs, or are synonyms of it? Does the strip ever show the species itself, or a species that is now "refused"? The index build is O(n²) over 6,844 species: confirm it is what the log says and note what happens at 20,000.
- Compare: three, then a fourth; a slug that resolves to a synonym; two of the same; a species with a refused climate in every row; the tray across two tabs; `?s=` with 50 slugs; no JavaScript (the page renders from the URL, the tray does not).
- The share card (`src/lib/share/card.ts`): a name that needs escaping, a fifty-character name, a species with no extremes, no DLI, a dry habitat, an origin list of ten; the PNG on a browser without `canShare`; what is in the PNG's text when the reader is in Fahrenheit (the axes, the labels, the extremes marks).
- Settings: numbering with a prefix containing spaces, lowercase, digits, eight characters; width 1 and 7; changing the scheme after plants exist (numbers kept? the next number right?); the same change on two synced devices at once (which wins, and does the loser get told?). Your site with coordinates typed as `40,38`. "Use my location" denied. Appearance in a browser that blocks local storage.
- Today (`src/lib/ui/Today.svelte`): a site set but the forecast route down; sowings with a status other than active; a plant with a photograph dated tomorrow; the year boundary (a photograph from 366 days ago).
- The install bar: `beforeinstallprompt` firing twice; dismissed, then installed anyway; iOS in Chrome (no share sheet); visits counted in local storage that a private window forgets.
- The menu: keyboard only (Tab into it, Escape, focus return); a screen reader's reading of `aria-expanded`/`aria-controls`; the scrim on a phone with the tab bar underneath.
- Caching and offline: with `cache-control: private` and `vary` on cookie and language, confirm that nothing else caches the HTML wrongly (the service worker in `src/service-worker.ts` serves the collection's shells cache-first: the store re-reads the cookie on the client for that reason; try to defeat it). Then the offline promise itself: every page under `/plants`, `/benches`, `/sowings`, `/labels`, `/backup`, `/sync`, `/frost`, `/settings` must open with the network off after one online visit. Grep for any `+layout.server.ts` or new server load under those routes.

### 4. Review the code

Not style. Look for: the units store being module-level state on the server (`src/lib/ui/units.svelte.ts` seeded from `+layout.svelte` out of the page's data) and whether that is safe under Workers' request model; the sheet's `let U` module variable set at the top of `cultivationSheet()` and read by `coldFloor()` (which is also exported and called from `note.ts` with its own `units` argument: can the two disagree?); the duplicated month arrays and glance computations across the species page, the compare page and the card (three copies of "which month is coldest"); `near.ts` allocating per pair; `search.ts` re-preparing the index on every keystroke or not; `Today.svelte` doing a forecast fetch on every front-page load for a grower with a site (rate limit implications for `/api/forecast`); the `vary` and `private` headers versus the SvelteKit `version.pollInterval` reload logic from round five; anything in the new routes that reads `localStorage` outside a try; anything in `settings` that can save a scheme the `NumberingScheme` type would reject.

Also: what in the new code is untested? `tests/e2e/smoke.spec.ts` grew by nine tests and `tests/unit/` by three files; say what they do not cover and which of those gaps would have caught something you found.

### 5. Layout and presentation, as a verdict

After the walk and the QA, say what you would change in the presentation before Show HN, ranked, with the reason. The author's own doubts, which you should confirm or overrule: whether "At a glance" is the right heading over the four figures; whether the one-line "nothing here is written by a person or a model" under the name is in the right place, or should be a heading, or is unnecessary; whether the accordion hides the cards too well; whether the front page needs the welcome card at all now that the rows explain themselves; whether the compare tray at the bottom-right fights the phone's tab bar; whether a first visitor needs to be told the site is derived, not written, before they read a figure, and where that sentence should go.

### 6. Launch readiness

Given a Show HN audience, the three things most likely to embarrass the author in the first hour, and the three most likely to lose a grower in the first minute. Say which of your findings block the post and which can wait a week.

## How to report

- Findings first, ranked: a wrong figure or a wrong unit on a page; a claim the page makes that the code does not keep; a flow a visitor cannot complete or cannot find; then everything else.
- Every finding: file and line, what you did to reproduce it (URL, input, sequence), what happened, what should happen, and a proposed fix. No finding without a reproduction or a line of code.
- The first-visitor walk as a narrative, separate from the findings.
- Separate "wrong" from "I would have done it differently". Both are welcome; label them.
- If a fix from round four or five is itself wrong or incomplete, say which finding and why.
- Prose, not bullet soup, except for the ranked list. Write for someone who will act on it tomorrow.

Do not summarise the app back to the author. Do not praise it. If you find nothing in an area, say you looked and what you tried.
