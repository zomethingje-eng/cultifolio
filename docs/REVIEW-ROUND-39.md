# Round thirty-nine: the index stays on the server

Not a review round: the first of the steps agreed for growing the reference past its 8,947 species (index, then a name tier, then a demand queue, then the build), done now because it is code the review rounds can test, and because it pays at the current size.

## What changed

1. **The browser no longer fetches the index whole.** `/api/index` (4 MB, 8,947 entries) was fetched by the front page for any search or chip, and by the species picker for its local suggestions; at a few tens of thousands of species that is unusable on a phone, and the index is the one thing the reference's growth would make bigger. No page fetches it now. A grower's own species still come by hash bucket (`/api/entries?b=`), as before; the route itself stays for the live check and the export.
2. **`/api/search?q=&n=&c=`** answers a search from the index the Worker holds in memory, with the same `prepare`/`search` ranking the browser ran (genus first, then names, common names, families, origins and older names; one typing error forgiven when the exact spelling finds nothing), prepared once per index load. Cacheable at the edge and in the browser for a day under the current corpus id, `no-store` under another, like the entries and sheets routes. Rate bucket `search`, 600 per ten minutes per address; a query is at most 80 characters of letters, digits and a name's punctuation; `n` is capped at 100. Unit tests: ranking, the typo, an origin, a stale corpus id, the cap, the limit.
3. **The front page** searches through the route, debounced 150 ms, an answer used only if it is still for the text in the box; "The catalogue could not be reached" with a retry when the route does not answer, which is a different fact from "Nothing matches". The climate chips ("Climate known", "Without climate") are the server's: `?chip=` filters the grouped catalogue, so a chip is a navigation that keeps the grouping, the open row and the letters, rather than a flattened list of every species, which is the thing that would not scale. The species picker's own-index suggestions come from the same route (the name typed already went to `/api/names`).
4. **What the site sends** gained one line on `/about/how` and `/about/formats`: the text typed into the catalogue's search box goes to the server as typed, since it is a question about the catalogue and not about the plants; a species page then opened already shows it. The collection's own lookups are unchanged and still by bucket.
5. **The live check** asks the search for a genus and holds the first hit, the corpus id and the cache header (8 checks locally, 14 in production).

## Not changed, on purpose

The server still groups the whole index per front-page request (`+page.server.ts`); that is the Worker's memory and a few milliseconds at this size, and the place to cache per grouping when the index is ten times larger. The service worker does not cache search answers (the browser's own cache does, for a day). The search is online-only, as it was: offline, the box says the catalogue could not be reached, and a grower's own species are still there from the bucket cache.

## Counts

401 unit tests on 40 files (one new), 77 e2e (one rewritten), local live check 8 of 8. No corpus step.
