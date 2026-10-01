# Review round forty: two reviews of the deployed `65f0965`, my own pass, triaged

The first reviewer's round thirty-four (eight findings, then fifteen recommendations on data structure, flow and layout) and the second reviewer's round twenty-six (six findings, a data-structure assessment and fresh Lighthouse runs), both of what rounds thirty-eight and thirty-nine deployed, plus my own pass over the flows on a phone viewport and the code. Every finding was checked in the source or reproduced. "R1-n" is the first reviewer's, "R2-n" the second's, "own" mine. The two reviewers' first picks are different and both are right, and both are round thirty-nine's.

## Search

1. **The one search box sent the collection's identifiers to the catalogue** (R2-1, the reviewer's one thing to fix; mine from round thirty-nine). The front page's box finds a grower's own plants by number, field number, name as received and cultivar, and round thirty-nine's effect sent whatever was typed to `/api/search` on every keystroke in both views, so `2026-0013` or a collector's field number went to the server, came back publicly cacheable, and sat in the URL. That contradicted `/about/how`, the README and the route's own comment. The two scopes are separate now: on "Your species" the box searches your plants and your own species on the device, nothing goes to the server or the URL, and "Search the whole catalogue for …" is one deliberate step that switches to the catalogue view and sends the text; on the catalogue view the box is the catalogue's, as before, and its placeholder and label say so. E2e: typing a number and a name on "Your species" makes no `/api/search` request and leaves no `?q=`; the button does.
2. **Ordinary punctuation was refused** (R1-1, the reviewer's one thing to fix; reproduced). The route accepted letters, digits and a name's punctuation and answered anything else with a 400 the page showed as "Nothing matches": an iPhone writes every apostrophe as `’`, so every cultivar name typed on one failed, and so did a comma, a slash, quotes or parentheses. Anything that is not a letter, a mark or a digit is a space now, which is what the tokeniser does with it anyway; a query of nothing but symbols is an empty search. Tests with each of the reviewer's inputs.
3. **Enter could open the previous query's first hit** (R1-2, reproduced). While a search is in flight, Enter waits for its answer, and opens nothing if the text changed meanwhile.
4. **A rate-limited search read as "could not be reached"** (R1-3). A 429 is its own state now, "Too many searches from this network; try again in N minutes" from `Retry-After`; offline is its own line; and the bucket is 3,000 per ten minutes per address, since the answers are public and cached at the edge and an office or a campus behind one address is many people.
5. **Chips ignored by a search and dropped by links** (R1-4, reproduced). A chip that is on filters the search's hits too, and says how many it hid; the Group-by links and the letter links keep it.
6. **The picker held the name service behind the catalogue search** (R2-3). The two are asked at once and each renders as it arrives; a slow catalogue search no longer holds the backbone's answer for its ten seconds.

## The collection

7. **"°F and inches" took a measurement in millimetres** (R2-2, reproduced). Measure showed `(mm)` and stored the number as typed whatever the units, so a US grower's "2" was 2 mm. A length is typed in the reader's units and stored in millimetres (`lengthToMm`), shown back in the reader's units on the card, the growth line and the timeline; heads and leaves are counts. `/about/formats` says which keys are millimetres. Unit test and an e2e round trip (2 in → 50.8 mm → 2.00 in).
8. **A device clock far behind the server parked the cursor** (R1-6, read). Round thirty-eight judged arrivals against this device's clock; a clock a day behind made every arrival look far ahead. Arrivals are judged against the listing's own `Date` header now, with the device clock only when there is none. Test with a server clock a day ahead of the device's.
9. **The place floor meant two things and the frost line read one of them** (own). "Heater set-point, or what it bottoms out at" are opposite claims on a cold night: outside reaching a set-point is the heater's job; reaching a bottoming-out figure is the plants'. The place form asks which (`floorHeld`), inherited with the floor; a held place's frost line says "Held at 5 °C by its heater; outside falls to −3 °C on Friday. A plant that needs more than 5 °C is the one at risk here", and the plant page says "held at" or "set to bottom out at". `/about/formats` lists the field.
10. **"Since watered 0 d, no watering recorded"** (own). The card prints "–" and says how old the record is. **The Source line** (own) reads "as a plant, 2026-10-01" rather than "plant · 2026-10-01".

## The pages

11. **The phone's first-screen photograph was lazy-loaded after all** (R2-5). Round thirty-seven eager-loaded the first tile; at 390 px the third tile is the largest paint. The first three are fetched at once, the first with priority. A tile whose photograph does not load shows a placeholder with the name rather than a blank card (own).
12. **At a glance before the quotation** (R2 design 1; R1 R12). The facts and the glance come before the Wikipedia paragraph: a phone reader reached what the page is for only after a screen of encyclopedia.
13. **The lower sections lay out as the reader reaches them** (R2-6). Climate, habitat, photographs, papers, related and registers sit in a `content-visibility: auto` block with an intrinsic size, so the opening text no longer waits for the whole document's style and layout. Anchors and find-in-page still work. The font-metric overrides are not taken (they need Newsreader's own metrics to be right); the gain is to be measured on the author's machine after the deploy.
14. **The species page serialised every sibling** (own): twelve and a count now, not six hundred cards for a genus taken whole.
15. **The sitemap is an index of files** (own): one file today, under the protocol's 50,000-address cap when the corpus grows. The live check reads the index and its first file.
16. **The genera file said "GBIF backbone"** (R1-8): the derivation reads WCVP; the header says so. Crassothonna is added to the list beside Othonna, so Othonna capensis has a page at the next derive.

## Taken from the recommendations, for the next round

The key-as-account setup flow (R9), the plant-number search above Today (R11), two-word system states with a "Why?" and a glossary (R14), a 404 that says what the reference takes (R15), the `acc` migration (R4), the no-op test for the dossier mends (R5), batch labels (R10), the plants list's controls hidden under eight plants and a "Set your site" setup step (own) are round forty-one.

## Deferred, with reasons

The wire-format changes (R1 atomic create, R2 notes base in the value, R6 per-device sequence numbers, R7 snapshots and deletes) are the first reviewer's strongest ideas and I agree with all four; together they rewrite the fold, the importer, the backup format and the engine, and that is not a thing to do in the weeks before a launch that is otherwise close. R6 is the one to do first, as its own round, when the author says. The store-backed undo (R8) and the plant page's thumb bar (R13) are post-launch. The taxon identity by key (R2 structure 1) and the log checkpoint (R2 structure 2) are noted for the growth work. The Show HN draft's five contradicted claims are listed for the author in the round's message.

## Counts

404 unit tests on 41 files (one new), 79 e2e (two new, one rewritten), local live check 8 of 8. No corpus step.
