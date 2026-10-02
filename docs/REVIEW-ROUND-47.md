# Review round forty-seven: the home page's own weight

The author's PageSpeed Insights run of the home page from Google's machines, after round forty-six: 88 (FCP 2.0 s, LCP 3.6 s, TBT 0, CLS 0), with the rows that tell the story. Time to first byte 10 ms (the Worker's copy). The document itself 51 KiB transferred, 703 ms on slow 4G, and the LCP photograph's "resource load delay" 680 ms: the tile could not start until the document had finished arriving. One render-blocking request left, the layout stylesheet, 150 ms. Everything else on the list was iNaturalist's hosting.

## What the 51 KiB were

The home page's HTML carried the whole catalogue as data: every row of every genus (1,321 of them, each with its thumbnail address, subtitle and counts) serialised into the page for the client to window through, when the page renders sixty and a phone shows ten. Gzipped, that was most of the document, and it sat between the first byte and the first paint of every visit. At the fifty thousand species the author has in mind it would have been several times that.

## Changed

1. **The page carries a window; the API serves the rest** (1). The row derivation moved to `src/lib/server/catalogue.ts`, built once per index load and grouping and kept (`WeakMap` on the index, as the search's prepared form is). The page's load returns the first sixty rows (or up to thirty past a `?open=` row beyond them, so a link lands on its row; or from `?from=`'s letter, or `?at=`), with the row count, the letters and the first row of each letter. A new `/api/rows?by=&chip=&at=&n=&c=` answers any window, capped at two hundred, cacheable for a day under the corpus id. The client appends from it as the reader nears the end, jumps to a letter by fetching from that letter's first row when it is not loaded, and falls back to the plain `?at=` and `?from=` navigations when the API cannot be reached, which is also what a reader without JavaScript gets. The row's species come with the page that opens it, never from the API. Locally the home page's HTML is 13 KiB gzipped; on the live corpus it should be about a fifth of what it was. Unit tests over a three-hundred-genus index for the derivation, the page's window in each form and the API's; the live check asks the API for the second window.
2. **Every stylesheet in the page** (2). Round forty-six left the layout's 34 kB sheet as a file; from Google's machines it was the one request between the HTML and the first paint, at 150 ms of a 450 ms estimate. The threshold is 40 kB now, so a page paints with no request after its HTML. It adds 7.6 kB gzipped to each page, which the row change removes five times over.

## Not verified here

The fixture corpus has three genera, so the e2e suite exercises the window's first page and not the appending, the letter jump past the window, or the API fallback; the unit tests cover the server side of each. After the deploy the author should scroll the home page to its end on a phone, tap a late letter (W), and open a genus from a letter link, and say what moved wrongly, if anything.

## Counts

419 unit tests on 43 files (one new), 84 e2e, local live check 10 of 10 (one new).
