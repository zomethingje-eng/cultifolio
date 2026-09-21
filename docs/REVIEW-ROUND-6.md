# Review, round six: the visitor's layer

The author's own review of the surfaces added since round five, before an outside model does the same with `REVIEW-PROMPT-6.md`. Three passes: a first visit, QA of the new code, and the code itself. Findings are numbered so the outside review can refer to them; the ones fixed in the same commit say so.

## 1. A first visit

The desktop front page now reads as a reference: a title, a count, a search box, and rows by genus. A visitor who grows plants finds a genus by letter or by typing, and a typo lands. That part works. Three things a stranger meets before any of it, in order, and all three are wrong for a stranger.

The segmented control at the top of every list page (Species, My plants, Benches, Sowings, Frost) is the app's own navigation shown to someone who has no plants. "Benches", "Sowings" and "Frost" mean nothing until there is a plant, and on a first visit they read as three things the visitor has failed to understand. The phone tab bar has the same five. The welcome card below it then explains the collection in two sentences, which is the right length, but it arrives after the five tabs have already said "this is an app with a lot in it".

**Finding 1 (layout).** With an empty collection, the segmented control and the tab bar should show two places, Species and My plants, and the other three should appear once there is a plant (they stay reachable from the menu regardless). The welcome card then does its job as the second thing seen, not the third.

The species page, in the new order, answers the grower's question in the first screen, and the accordion reads as v2 did. Two things repeat and one heading is confused. The id card's pills ("Climate known", "52 open records", "20 photographs", "Cactus or succulent") and the fact strip beneath ("Family, Described by, Native to, Wild records: 352 in range · 52 open") say the record count twice within a hand's width. And the heading "Cultivation, in short" sits over the four figures and a card whose own title is "In short", so the words appear twice in twenty pixels.

**Finding 2 (layout).** Drop the records pill; the pills are states (climate known or not, photographs or not, the archetype, "you grow N") and the strip is the facts. Rename the section heading "At a glance" and leave the card "In short". Fixed in this commit.

The sentence that makes the site what it is, that nothing on a species page is written by a person or a model and every figure says its source, appears on the front page's welcome card and on `/about/how`, and nowhere on the species page itself, which is the page a Show HN visitor will land on from a comment link.

**Finding 3 (layout).** One line under the id card, in the small muted style: "Every figure on this page is derived from public data by a stated rule and says its source; nothing here is written by a person or a model. How." Fixed in this commit.

On a phone the accordion's plus sign is small and to the right; a thumb reads the row's one-line text as the whole card and does not know there is more. The row's whole width is the target, so the tap works, but nothing invites it.

**Finding 4 (layout).** "Open" as a word beside the plus on phone widths. Fixed in this commit.

The rest of the walk held: units switched everywhere I looked, the menu reached everything, Settings read as settings, the tray stayed out of the tab bar's way, the install bar read as the app's own line and not as an advertisement.

## 2. QA of the new surfaces

**Finding 0 (flow broken, fixed; the one that mattered).** The units layer added a root `+layout.server.ts` to read the cookie. The collection's pages are client-rendered (`ssr = false`), and a client-rendered page with a server load fetches `__data.json` on load, so every plant, bench, sowing and backup page needed the server to open, and offline none of them did. The offline sync e2e caught it (two and a half minutes waiting for a button on a page that had fallen back to the cached `/sync` shell), and it would have shipped with the last deploy. The cookie is now read only in the server loads of the pages that are rendered on the server (front, species, compare, settings; `src/lib/server/units.ts`), the layout seeds the store from the page's data when there is any, and the store reads the cookie itself on the client. A new e2e opens a plant page offline with a Fahrenheit cookie and checks both. The lesson for the prompt: any root server load is a regression for an offline app, and the reviewer should grep for one.

**Finding 5 (wrong figure, fixed).** A bench floor typed as 40 °F was stored as 4.4 °C and read back as 39.9 °F. Storage is °C to two decimals now (4.44 → 40.0) for the floor and for bottom heat, with a unit test on the round trip. `src/routes/benches/[id]/+page.svelte`, `src/routes/sowings/`, `tests/unit/units.test.ts`.

**Finding 6 (wrong unit, fixed).** The service worker serves the collection's shell pages (`/plants`, `/benches`, `/sowings`, `/labels`, `/backup`, `/sync`, `/frost`) cache-first. Their cached HTML carries the units the server saw when the shell was cached, so a grower who switched to Fahrenheit and opened a bench from the cache got a page seeded metric. The units store now reads the cookie itself on the client and prefers it over the HTML's seed. `src/lib/ui/units.svelte.ts`.

**Finding 7 (mismatch, fixed).** The numbering preview upper-cased the prefix but did not strip spaces and punctuation, while the save did, so "j f" previewed as "J F-0001" and minted "JF-0001". One `cleanPrefix` for both. `src/routes/settings/+page.svelte`.

**Finding 8 (load, open).** `Today.svelte` fetches the forecast on every front-page load for a grower with a site. `/api/forecast` is rate-limited per address and MET Norway asks for restraint; a grower who opens the app ten times in an hour makes ten identical calls. Cache the answer in session storage for thirty minutes, keyed by the site. Not fixed here; it needs the frost page to share the cache so the two never disagree.

**Finding 9 (visit counting, open).** The install bar counts page loads as visits, so two full loads in one sitting make the "second visit" and the bar appears in the first session. Count days, not loads: store the date of the last visit and count a visit when the date differs. Small; the bar is honest either way.

**Finding 10 (hydration, open).** The species page's months are given for the northern hemisphere on the server (no site is known there) and switch to the reader's hemisphere on the client once the site or a bench loads, so a southern grower sees "November to April" for a moment before "May to October". Cookie the site's latitude sign beside the units cookie and seed the hemisphere on the server the same way. A grower's issue only, not a visitor's.

Looked and found nothing: the search module with hybrid signs, diacritics and one-letter queries (the tests cover them); `?by=`/`?open=` with junk (falls back to genus and closed); the climograph in inches across a 500 mm month and a dry year (tests); the compare page with a fourth slug (the server takes three), a synonym (resolves), and no JavaScript (renders; the tray does not, as designed); the share card with `&` in a name (escaped); the frost forecast text with `units=` absent (metric, as documented). `cache-control: private` with `vary` holds in the browser; wrangler dev's cache does not honour `vary`, which is how finding 6's cousin on the server side was found and why the header is `private`.

## 3. Code

Two things a reviewer will point at, and what I think of each.

The units store is a module-level singleton seeded on the server from the layout's data, and Svelte's server render is synchronous per request, so two requests in one isolate cannot interleave between the seed and the read. That is true today and fragile: an `await` introduced anywhere in the render path between the layout and a page would break it silently. The robust form is Svelte's `setContext` in the layout and `getContext` in the consumers, which is per render tree. Worth doing, not urgent; `src/lib/ui/units.svelte.ts` says why it is what it is.

`sheet.ts` holds the reader's units in a module variable set at the top of `cultivationSheet()` and read by `coldFloor()`, which `note.ts` also calls with its own units argument. The two cannot disagree in practice because every caller passes the same units, but a function whose output depends on which other function ran last is a trap for the next person. The cleaner shape passes `units` down explicitly; it touches every formatter call in the sheet, which is the reason it was not done in the same day as the units layer.

Three copies of "which month is coldest, warmest, wettest" exist: the species page's `glance`, the compare page's `col`, and the card's top. One `glance(months)` in `$core` would serve all three and be tested once. The month-name arrays are already one (`MON3`) but the pages still carry their own; that is the same cleanup.

`near.ts` allocates a tuple per admitted pair; at 6,844 species that is a few million short-lived arrays and 33 seconds. Fine at this size, and the log says so; at 20,000 species it is five minutes and the tuples should become two parallel typed arrays. Not now.

Untested: the settings page's site form beyond the happy path; `Today.svelte` at the year boundary; the install bar's iOS branch (no Safari in Playwright's Chromium); the service worker's cache-first shells with a changed cookie (finding 6 has a unit-level fix but no e2e); the compare tray across two tabs.

## Before Show HN

Finding 0 is the reason to redeploy today. Findings 1 to 4 change what a stranger sees in the first minute and are all in this commit. Finding 8 is the one most likely to embarrass on a busy day (a grower's own reloads tripping the forecast limit and the front page saying "Frost not checked"). Findings 9 and 10 can wait a week. The two code notes are for after the post.
