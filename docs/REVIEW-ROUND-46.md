# Review round forty-six: the render-blocking stylesheets

The author's morning runs, after round forty-five: home page 76 (FCP 3.0 s, LCP 5.0 s, TBT 0 ms, CLS 0), with "render-blocking requests, est. savings 750 ms" at the top of the list; the species page earlier that morning 69 (FCP 3.7 s) with the same line at 660 ms. Neither page had shown the line before that day, and the same pages had read FCP 1.6 and 1.5 s two days earlier. TBT at 0 says the machine was idle; the paint waited on the network.

## What blocks the paint

Every page's HTML named five to seven stylesheets, each a request the browser must finish before it paints anything: the layout's (34 kB, the one that matters) and four to six component and page sheets of a hundred bytes to ten kilobytes each. On a warm edge they arrive together and cost one round trip; on a cold one (every deploy renames them, and a quiet site's assets fall out of a location's cache between visits) each is a trip to the asset store, and Lighthouse's estimate is what it saw. Whether the morning's 750 ms was a cold edge after two deploys in twelve hours or the author's connection, the count of blocking requests is ours to cut and the measurement will say which it was.

## Changed

1. **A page's own stylesheets go into its HTML** (1). `kit.inlineStyleThreshold` at 12 kB: every sheet below it is a `<style>` in the page, and only the layout's remains a request, cached for a year under its hash. The species page's HTML grows by about two kilobytes gzipped. Kit still names the inlined files as disabled links so a client-side navigation finds them cached. `style-src` already allows inline, so Kit adds no hashes and the CSP is unchanged.

## The home page's first byte, and a bug the first fix found

2. **The home page is held like a species page** (2). The run after the inlining put the one remaining stylesheet at 180 ms and FCP still at 2.7 s, and the home page's own render explains the rest: it is `private` for the same reason the species page is (the reader's units), so nothing held it, and every visit grouped the whole index and chose the day's tiles on the Worker. `HELD_PAGES` in `hooks.server.ts` now lists the home page beside the species pages, keyed by the queries it reads (`by`, `open`, `chip`, `from`, `at`) and the units; the search typed into `?q=` is the client's and is not in the key. The live check asks the home page twice and requires the second held.
3. **A data request was answered with the held HTML** (3; reproduced, live since round forty-five). A client-side navigation asks for the page's data at `/__data.json` under the page's own URL; Kit strips the suffix before the hooks run and says so in `event.isDataRequest`. Round forty-three's key carried the whole query, so the data request's `x-sveltekit-invalidated` missed the page's copy by luck; round forty-five's key ignored unknown queries, and from that deploy a client-side navigation to a species page whose HTML had been held in that location in the last minute received the HTML, could not parse it, and showed Kit's 500 page. The home page's cache made it visible in the e2e suite (the back-navigation to a search). Data requests are neither answered from a copy nor stored. A unit test, an e2e test that holds a species page and then navigates to it from a search, and a live check that asks a held page's `__data.json` and requires JSON; all three fail against the bug.

## What the next run should show

The second visit to the home page in a location within a minute is answered from the copy, so FCP on a Lighthouse run (which loads the page more than once) should fall toward the species page's; the first visit still renders. A PageSpeed Insights run from Google's machines remains the neutral measurement.

## Counts

415 unit tests on 42 files, 84 e2e, local live check 9 of 9.
