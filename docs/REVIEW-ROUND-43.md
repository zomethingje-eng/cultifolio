# Review round forty-three: the species page's time to first byte

After round forty-two the Welwitschia page's Lighthouse run (mobile; 88, LCP 3.8 s, CLS 0) left one line: "document request latency, est. savings 670 ms". Four `curl` timings of the page from the author's machine, seconds apart, put the time to first byte at 0.75, 0.95, 1.24, 0.74 and 1.08 s, with no warm-up between them. The page is never edge-cached (its header is `private`, since it is rendered in the reader's units), so every visit is a Worker render, and the render path was read for what it paid.

## What the render paid

1. **The index was re-read almost every minute** (1). The parsed index (4 MB, 8,947 rows) is held per isolate for a minute, and past the minute `loadIndex` fetched and parsed the whole object again, on the first request of nearly every minute of a quiet site: several hundred milliseconds before the page could begin. Past the minute the bucket is now asked for the object's etag alone (`head`, a few milliseconds), and the parsed copy is kept while the etag is the one it came with; the object is read again only after an upload. A test with a counting store: one read, then heads once a minute while the etag holds, a second read when it changes, with the corpus id changing with it, and a read when the head answers nothing.
2. **Two bucket reads, one after the other** (2). The dossier and the genus record are two objects, and the genus is known from the index entry before the dossier arrives, so the two are read together; they were two round trips in series on every page.
3. **A page rendered in this location is kept for a minute** (3). The species page is public content in the reader's units and hemisphere; its `private` header is right for shared caches, which cannot key on a cookie. The Worker's own cache can: `hooks.server.ts` keys a rendered species page by its path and query, the units and the hemisphere cookie, stores it under that key for sixty seconds (the browser's own allowance, so a deploy is no staler than before), and answers the next request in that location from it. Only a 200 HTML answer that sets no cookie is stored; the reader's copy keeps its `private` header; the held and rendered answers carry `x-cultifolio-page` so the live check can tell them apart. Tests: a page rendered once and held for the next reader in the same units; other units, the other hemisphere, a `?was=` query and a browser language that resolves to other units each rendered for and stored apart, and one that resolves to the same units held; a 404, a non-HTML answer, a cookie-setting answer and every non-species page never stored. The live check requests a species page twice under a fresh query and requires the first rendered and the second held, private and identical.

On the local Worker the rendered page answers in about 55 ms and a held one in 8 ms. On the live site the author's `curl` will say what the render path costs now; the index change is the one that should move the first visit, and the cache the ones after it.

## Not changed

The HTML stays `private` to shared caches. Rendering the units on the client instead (one HTML for everyone, edge-cached for a minute) would let Cloudflare's own cache hold the page in every location and is the larger win for a burst of strangers from one link; it changes what the first paint shows for a reader in US units (metric figures, then a swap) and is a design decision for the author, noted and not taken.

## Counts

413 unit tests on 42 files (one new), 83 e2e, local live check 9 of 9 (one new).
