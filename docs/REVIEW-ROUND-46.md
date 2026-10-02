# Review round forty-six: the render-blocking stylesheets

The author's morning runs, after round forty-five: home page 76 (FCP 3.0 s, LCP 5.0 s, TBT 0 ms, CLS 0), with "render-blocking requests, est. savings 750 ms" at the top of the list; the species page earlier that morning 69 (FCP 3.7 s) with the same line at 660 ms. Neither page had shown the line before that day, and the same pages had read FCP 1.6 and 1.5 s two days earlier. TBT at 0 says the machine was idle; the paint waited on the network.

## What blocks the paint

Every page's HTML named five to seven stylesheets, each a request the browser must finish before it paints anything: the layout's (34 kB, the one that matters) and four to six component and page sheets of a hundred bytes to ten kilobytes each. On a warm edge they arrive together and cost one round trip; on a cold one (every deploy renames them, and a quiet site's assets fall out of a location's cache between visits) each is a trip to the asset store, and Lighthouse's estimate is what it saw. Whether the morning's 750 ms was a cold edge after two deploys in twelve hours or the author's connection, the count of blocking requests is ours to cut and the measurement will say which it was.

## Changed

1. **A page's own stylesheets go into its HTML** (1). `kit.inlineStyleThreshold` at 12 kB: every sheet below it is a `<style>` in the page, and only the layout's remains a request, cached for a year under its hash. The species page's HTML grows by about two kilobytes gzipped. Kit still names the inlined files as disabled links so a client-side navigation finds them cached. `style-src` already allows inline, so Kit adds no hashes and the CSP is unchanged.

## What the next run should show

The "render-blocking requests" row should list the one layout sheet, and FCP should return to the 1.5 to 1.8 s of the earlier runs if the morning's figure was a cold edge; if FCP stays near 3 s with one blocking request, the connection is the cause and a PageSpeed Insights run from Google's own machines is the next measurement.

## Counts

413 unit tests on 42 files, 83 e2e, local live check 9 of 9. One file changed.
