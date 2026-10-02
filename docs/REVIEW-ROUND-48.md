# Review round forty-eight: the author's phone, after round forty-seven

Two findings from the author scrolling the deployed home page on a phone.

1. **The search row did not stay pinned** (1). The phone layout pins only the search row while the list scrolls (round seventeen's design note), but the row was a child of the head block, so its containing block ended where the head did: it unpinned a few rows in, after the chips had scrolled up underneath it with the row still painted over them. The head block is `display: contents` on phones now, so the row's containing block is the page and it stays pinned through the whole list, with a rule under it; and since the chips and the letter index do scroll away, an A–Z button on the pinned row scrolls them back under it and puts the focus on the first letter. e2e at 390 px: scrolled deep into the page, the row sits at the top bar's edge; A–Z brings the index into view.
2. **A letter showed that letter and everything after it, and nothing before** (2). Round forty-seven opens a window at the letter's first row and fetched nothing above it, so scrolling up from W met the head of the page. The list fills in upward now: a sentinel above the first loaded row fetches the chunk before it as the reader nears the top, prepends it, and corrects the scroll by the height added (by hand; Safari does not anchor), with an "Earlier" link as the no-JavaScript and failure path, as "More" is below. e2e: a page opened at `?at=2` fills in the rows before it and ends whole, with no "Earlier" left.

## Counts

419 unit tests on 43 files, 86 e2e (two new), local live check 10 of 10.
