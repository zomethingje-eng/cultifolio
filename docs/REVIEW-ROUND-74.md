# Round seventy-four: My spaces, an opt-in example, a plainer front page, and words for every grower

Round seventy-four makes four changes the owner decided after round seventy-three. One agent made them; its report is
`review-74/W.md`.

`FOLD_RULES` stays 8 and the device database stays at version 4. No stored field, kind or record type changed.

## 1. "Places" becomes "My spaces"

The grower's places are called spaces wherever a grower reads them, so the two collections read "My plants" and "My spaces"
beside the public reference, Species:

- the menu, the top bar, the phone's tabs, the crumbs and the page titles;
- the forms, buttons, toasts, empty states and aria labels;
- the import's column words, the frost watch, the backup's counts and the about pages.

**What did not change:**

- The addresses (`/places`, `/places/<id>`, the old `/benches` redirect) stay, so labels and bookmarks keep working.
- Stored names (`locationId`, the `location` kind) and every format are unchanged.
- A word meaning a geographic place (a habitat, a record's locality) is not a grower's space, and keeps its word.

On a 320 px phone the tab label wraps as "My / spaces"; at 200% text the bar shows icons, as it did before.

## 2. The example collection is opt-in

A new visitor now starts on the real site, blank:

- Nothing opens the example collection by itself.
- An empty My plants, My spaces, Propagation or Today shows its own empty state with one button, "Show the example collection", and the sentence "A sample kept apart from your own collection, which you can close at any time."
- The sample is the same separate collection as before, and is never merged into the grower's own log.
- Its exit, the second-tab notice and the deletion of a sample left behind are unchanged.
- The tab's "left the example" mark is removed, since it existed only to stop the automatic opening.

## 3. The front page drops its demonstration

The block "This is what a species page with a habitat climate shows" (Acer monspessulanum's figures and chart) is gone,
with its server read and data.

| | Before | After |
|---|---|---|
| Front page HTML (sent) | 17,010 bytes | 14,352 bytes |
| Front page, first visit | 376 kB | 365 kB |

The chart components stay, because the species pages and Today use them.

## 4. Words for every grower

The site is for home growers of any plant (indoors, on a patio, in a greenhouse), not cactus, succulent or bulb growers
alone. These now say so:

- the front page's title, description and introduction, which reads "A reference for the plants people grow, N species so far, each with its habitat climate where its records allow one";
- the welcome line, "Keep your plants' record on this device";
- the link preview's words and image;
- the README.

**What stays factual:** `/about/how`'s account of how today's species list was derived (the specialist genera) is a fact
about the corpus and stays.

**The phone catalogue:** it still opens on the collector genera this round. The owner has chosen most-grown genera,
ranked by a sourced measure of cultivation, for round seventy-five.

## 5. Runs

- **Unit:** 3,923 passed, 8 skipped. `tsc` and `svelte-check` are clean.
- **Strict Chromium and the Chromium phone at four workers, on the final commit:** 484 passed, 5 skipped, 18.6 minutes. One test failed: smoke-2's "removing asks twice", at a hydration wait, because the whole unit suite was run on the same two cores at the same time. Run alone three times over, all 51 of smoke-2's runs passed.
- **The same shared run timed out `r74-growers`'s walk of `src`.** It takes about 5 seconds alone and now has 60 seconds, as a whole suite on a busy machine needs.
- **New guards:**
  - `r74-spaces` checks that no grower's "place" is left in visible text, with the geographic uses named.
  - `r74-growers` checks that no page pitches the site to one kind of grower, with the factual mentions named.
- **The owner's `--tier=app` run:** 1,351 passed, 17 skipped and two flaky, both in Firefox, so the strict run stopped the deploy.
  - **smoke-3, "a place takes plants in":** "Cold frame was not added: collection not loaded." A space named and added in the first moments of My spaces was refused, because a write made before the collection had opened threw. Every write now waits for an opening that has begun (`untilOpen` in `collection.svelte.ts`); a loaded collection's writes run exactly as before, and with no opening begun a write is refused as before. `collection-store.test.ts` has the case, and it fails on the earlier code.
  - **r60 11, the example's Sync and Backup:** Firefox's `page.goto('/sync')` ended in "unknown error" with the page still on Today. It is not reproduced here (no Firefox in the workspace) and was not seen in earlier rounds. It passed on its retry, and the owner reruns it five times before the deploy.
  - After the fix: the unit suite 3,925 passed; `svelte-check` clean; the six affected spec files in Chromium and the phone, 119 passed.
- **The owner's runs after the fix.** The two Firefox tests five times each: 10 passed. The whole `--tier=app` run again: 1,351 passed, 17 skipped and two flaky, each a different test from the first run and each passing on its retry:
  - **Firefox, smoke-2 "removing asks twice":** the plant page's Water left no line. The page had drawn, and nothing was said.
  - **WebKit, r64f 7:** the first worker did not take control within 30 seconds. Its trace shows the page's requests all answered; the worker's own precache is not in it.
  - Neither test changed in this round beyond the removed helper. Across the two runs, four tests were flaky once each, three of them in Firefox, which runs at four workers while WebKit is held to two. Round 75 measures Firefox at two workers before anything else is read into these.
- **r64f 7 in WebKit, run alone five times, then five more with a 90-second wait and a report:** 7 of 11 attempts failed. Each failure said the worker was `activated` and the page had no controller. The second page of a first visit, loading as the first worker activated, was left out of its claim, and stayed uncontrolled until its next navigation; the passes took control in about one second. A visitor in Safari lost nothing but offline use on that one page.
  - **The fix:** once a worker is active, a page with no controller asks it to claim it (`'claim'`, in `+layout.svelte`), and the worker claims its pages again (`service-worker.ts`). `r67p-takeover.test.ts` has the worker's half, and it fails on the earlier worker. r64f 7 waits 30 seconds again and, failing, says where the registration stood.
  - After it: the unit suite 3,927 passed; `svelte-check` clean; the 49 spec files that touch the worker, in Chromium and the phone, 411 passed.
  - **On the owner's PC, five runs in WebKit:** four took control in 0.7 to 1.2 seconds; one was still missed after 30 seconds. The page now asks again while it has no controller, at 0.5, 1.5, 3, 6 and 10 seconds (`askClaim`). Chromium and the phone again: 411 passed.
  - **Ten more runs in WebKit:** nine took control in 0.6 to 1.3 seconds; one was left out all the same, the worker activated, so asking again does not move WebKit there. That is WebKit's: no data is lost and offline use starts on the next page. r64f 7 now allows it in WebKit only, when the worker is activated, and then requires the next page to be the worker's; in every engine it still checks that the page did not reload and kept the name typed.
- **The owner's last `--tier=app` run:** 1,351 passed, 17 skipped, two flaky. r64f 7 took control in 1.0 to 2.7 seconds in every engine. The two flaky tests are new to the list and passed on their retry: WebKit's 400-plant backup (its restore past the 125-second wait) and Firefox's r62bg 1 (a Leave answered Cancel read as a Leave, where the page's three-second allowance for a "Leave site?" decides). Neither was changed in this round. Across the four runs, nine flaky tests, each once: two were faults and are fixed (the space refused while the collection opened; WebKit's left-out page), the rest timing in Firefox and WebKit under four workers. The owner deployed on this run. Round 75 starts with the flake rate: Firefox held to two workers, and these seven tests run 20 times each.

## 6. No corpus step

Nothing in this round reads or writes a dossier, the index or the manifest.
