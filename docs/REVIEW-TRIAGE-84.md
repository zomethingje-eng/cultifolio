# Round eighty-four: three reviews of `ba78fb9`, triaged

These are the three reviews of commit `ba78fb9` over corpus `e8885155673882ba`:

- **The internal deep review:** `REVIEW-SELF-84.md` and `review-84/{w,p,d,c,s}.md`.
- **Outside review A:** "Cultifolio review, round eighty-four". It ran Chromium only, and sampled 68 species.
- **Outside review B:** "independent review of ba78fb9", saved as `review-84/outside-b.md`. It ran Chromium, WebKit and Firefox on Windows, and sampled 61 dossiers.

The coordinator re-checked each new claim on the live site or in the code on 2026-10-29. The marks below mean:

- **Confirmed:** reproduced.
- **Refuted:** checked, and not true.
- **Not reproduced:** checked, but the result differs.
- **Read:** the code agrees, but nothing was run.

## Where all three agree

All three reviews found these. They are the strongest signal:

1. **The reason given for missing cold extremes is wrong.** The glance card and the sheet say "ground too far off". The record of sources gives the real cause. **Confirmed** on Eulychnia acida. The cause is `sheet.ts:266-278`, which words three causes as one. Review A adds that the record-low rule (round 80) has had the same wrong words since it began.
2. **Regions tested by bounding box.** 125 of 369 regions still have no shape, among them the Cape Provinces, Japan, France, Great Britain, Turkey, Greece, Mexico NW and SW, Taiwan and China. The box test also gets no 0.05° buffer, where the shape test does. The effects:
   - **Records let in that should not be.** Galanthus nivalis's typical spot is in Belgium (D); Melissa officinalis has the same fault.
   - **Records shut out that should count.** Indigofera taiwaniana's 14 Taiwanese records are called "outside the range", so it has no climate (A; the dossier says nOutsideRange 14, native TAI only).
   - **Ranges drawn as rectangles** on both maps (W1).
3. **/about/how is stale and too long.** The stale passages:
   - "until the upload… finds nothing";
   - "due at the end of October";
   - round 83's corrections described as still to come;
   - "a hybrid gets no climate";
   - counts from the 23 October corpus;
   - search examples the live site no longer gives.

   One paragraph runs to 6,760 words. Review B adds the number-ledger claim (item 9 below).

## Found by two of the three

4. **Climates read from records outside the native shape through restricted records** (A1, B1). **Confirmed** on two pages:
   - **Aloe vera** (`k298116`, built 2026-10-21): typical spot 25.425 N, 56.175 E, which is Fujairah, United Arab Emirates. Its only native region is Oman, and Kew holds the UAE as introduced.
   - **Ficus elastica** (`k2810307`): typical spot 22.125 N, 88.575 E, in the West Bengal Sundarbans. It is in none of its native regions.

   **Why the repairs missed them.** Round 82's repair listed only pages with **open** records outside the shapes. Round 83's listed only regained shapes and default points. A page whose outside records are restricted (here CC BY-NC iNaturalist observations) was in neither list. The `gbif.occurrences` row of these pages names no range test, as on 289 of 587 pages D sampled.

   **Exposure.** Every page built on 21 and 22 October and not re-derived since: probably over 20,000 pages. **This is the most serious data fault of the round, because it falls on the most-grown pages.**
5. **Phone and desktop: the cultivar filed as a hybrid** (W5, A9). Echeveria 'Lola' and Crassula 'Buddha's Temple' are filed as "HYBRID, parentage not stated". `names.ts:153`.
6. **Print leaves out the cultivation sheets** (W10, A11).
7. **My plants shifts on a cold load with 400 plants** (P2, A12, B4). CLS 0.29 to 0.7.
8. **The Add press and the picker** (C1, A22, B "unresolved").
   - **C1, confirmed live:** the list reopens after the field is left, and a tap on the next field picks a species.
   - **A22, read:** adds that `check()` also sets the list open under a press, and that the status room is too short at 320 px.
   - **Taken together,** they explain the WebKit labels failure: the test's snapshot showed the list open after the field was left.

## New, and confirmed

- **San Pedro cannot be found (A8). Confirmed.** `Trichocereus pachanoi` and `Echinopsis pachanoi` both answer 0 hits, though `/species/trichocereus-pachanoi` redirects to Trichocereus macrogonus. GBIF files the name under a variety, and the index keeps species-level names only. "Living stones" finds one Lithops.
- **"Snowdrop" puts Galanthus nivalis 24th (S2). Confirmed.** "Saffron" and "pepper" fail the same way.
- **Today says "backup −1 d ago" after 8 pm in Pittsburgh (A14). Confirmed in the code.** `Today.svelte:147` compares the UTC date of an ISO instant with the local day; the backup page writes it with `toISOString()`. The same rule is applied to "synced N d ago".
- **The climate chart at 360 px is unreadable (P1). Confirmed.** The cause is `Climograph.svelte:30`.
- **The glance cards fill four of six columns on desktop (W3). Confirmed.** The cause is `Glance.svelte:136`.
- **Euphorbia × martini's quoted summary stops mid-sentence with no cut mark (A4). Confirmed.** The dossier's text ends "…E. characias subsp. characias".
- **Kew's names (D3). Confirmed on `k3313620`.** About 500 headings are GBIF's name, not Kew's accepted one. This splits the stapeliad and Anacampseros genera, and a few headings are malformed.
- **"Not checked" repeated on a keyless page (A10).** Abies marocana's page carries it many times. Round 82's "said once" holds on some page types and not on others.

## New, read or smaller (accepted unless noted)

From A:

- the author-facing wording on species pages (A7, with P7 and W12);
- Cylindropuntia fosbergii's "another author" line with no author (A6a);
- Ferocactus hamatacanthus printing a repository path, twice (A6e);
- the `offline-tried` session key missing from /about/how's "every key", and the test's pattern missing it (A15);
- NOTICE leaving out ETOPO and Wikidata (A20);
- no navigation at 640×400 (200% zoom on a laptop) apart from the ✳ menu (A17);
- the front strip featuring wild Rosa and Rubus rather than plants growers grow (A, appearance);
- sync treating any TypeError as "not reached" (A16, read);
- a sync run ending on the first photograph that answers 5xx (A16, read).

From B:

- the maps' captions not tied to the SVGs (B8);
- the repair listings skipping unreadable dossiers without saying so (B11);
- predeploy's closing "may go ahead" after a filtered run (B12).

From the internal review: W2, W4, W6 to W13; P3 to P9; S3, S6 to S12; D4 to D9; C2 to C4.

## Disputed, refuted or not reproduced

- **B6, the network error logging (NEL) is not disclosed. Refuted.** /about/how's privacy section names Cloudflare's network error logging, `a.nel.cloudflare.com`, and how long it lasts.
- **B9, `/api/index` cached for four hours. Not reproduced.** A HEAD request now answers `public, max-age=300`. Review B saw 14400 on a GET. Worth one more look at the Cloudflare cache rules, but not a finding as it stands.
- **B10, the page weight.** Both outside reviews measured Sempervivum tectorum at 174,671 bytes of HTML (39 kB gzipped); Echeveria elegans is 130,546 bytes. The "about 126 kB" in the review prompt was the live check's own page, not the rich one. The prompt overstated the gain. The work is real: 238 kB down to 175 kB on the same page.
- **B2, the extremes rule "calls a valid series impossible".** The counterexample is arithmetically right: a skewed month can put its mean low under the year's 1st percentile. In a real climate it would be rare, but the page's sentence asserts more than the rule proves. **Accepted as a wording fault:** say it as a check that the two sources disagree, and keep the rule. Review A's suggestion of a margin, to catch Cedrus deodara, is a new rule and waits.
- **B3, the phone's first screen does not show the four habitat figures.** True: the name card, the actions and the photo strip come first. It is a design choice, listed under the owner's decisions.
- **B5, the number ledger outside the log.** True and narrow. After a Replace, the reservation of a number issued later lives only in `meta['issued:accession']`, which rule 6 says must be droppable. **Accepted:** write the reservation into the log at Replace.
- **Review A7-adjacent, Lithops lesliei and Conophytum calculus have no climate.** This is by the 10 km rule: iNaturalist obscures threatened taxa, and herbarium sheets state no accuracy. The pages are honest; this is a cost the rule accepts. No change.

## Recommended round 84

### Part 1: the Worker only (one deploy; no corpus work)

1. **The picker.** It opens only while the field has focus, closes on a tap outside, and `check()` never opens it. It waits for the reference's search before arming. The status room keeps one height. (C1, C2, A22)
2. **The extremes wording.** Each cause gets its own words, and the warm-night cause is said as a check that the two sources disagree; this covers the glance card, the sheet, the plant page and the share card. (D1, S1, A3, B2)
3. **The climate chart at 360 px, and the glance grid on desktop.** (P1, W3)
4. **Today's dates.** One local-date rule for instants, for backup and sync. (A14)
5. **/about/how and /about/formats:**
   - the stale passages put in the present tense, and the counts read from the index;
   - the long paragraphs broken into lists under their headings;
   - the missing session key, NOTICE's sources, and the seam test for the quoted search examples.
6. **Names on the add form.**
   - A cultivar in any quotes is a cultivar.
   - A cultivar under a genus is filed as "a cultivar, species not stated", not a hybrid.
   - An older name links its species page.
   (S3, W5, A9, W6)
7. **The pages:**
   - print opens the cultivation sheets;
   - "not checked" said once on every page type;
   - the author-facing sentences reworded;
   - the "another author" line without an author;
   - the repository path;
   - My plants' layout held while it opens;
   - navigation at 640×400;
   - the compare pill on species and compare pages only;
   - the few-records counts in visible text;
   - the maps' captions tied to the SVGs.
8. **Search ranking:** the species whose own common name is the word comes first ("snowdrop", "saffron", "pepper"). (S2)
9. **The ledger:** a Replace writes its number reservations into the log. (B5)
10. **Operations:** the repair listings fail when a dossier cannot be read, and predeploy's closing line follows the scope of the run. (B11, B12)

### Part 2: the corpus (the owner's PC, offline, about 7 to 9 hours, then the upload)

1. **The shapes script.**
   - Drop an out-of-box ring rather than the region, and place Great Britain's provinces. Most of the 125 box regions then get shapes.
   - The box test takes the same 0.05° buffer as the shape test.
   - **Every** in-range record is tested against the shapes, restricted ones included.
2. **One offline re-derivation of every page** (`--keys` over all 48,357, `--offline --grid climate --bulk bulk`), rather than another selective list. Two selective repairs have now missed pages. A whole pass also writes the range test's words into every page's record (D6). Round 83's 18,407 pages took about 2.5 hours, so all of them should take about 6 to 7.
3. **Index-time changes, with the same pass:**
   - the binomials GBIF files under a species' varieties as search-only names (San Pedro);
   - Kew's accepted name as the heading on `k` pages, if the owner agrees;
   - the cut mark on a summary that does not end a sentence;
   - Xanthoceras's carried records dropped;
   - hybrids' POWO links from their Kew entry;
   - the generic common names ("Fig", "Ginger").
4. **The maps draw the regions' shapes** from one static file, like the coastline.
5. **Then the index, the live check, a check of Aloe vera, Ficus elastica, Galanthus nivalis and Indigofera taiwaniana, and the upload.**

## For the owner to decide

1. **Kew's accepted name as the heading on `k` pages.** Recommended: yes. Kew is the reference's stated authority for names, and Kew's genera are the ones stapeliad and Anacampseros growers use.
2. **A whole re-derivation rather than a third selective repair.** Recommended: yes, overnight on the PC.
3. **The phone's first screen.** A compact line under the name card (cold floor, rain, light, season) ahead of the photo strip. Recommended: yes; the full cards stay where they are.
4. **The front page's photograph strip** chosen from the "Popular genera" rather than by wild-record counts. Recommended: yes.
5. **Default points at a named locality with no stated accuracy** (D7). Recommended: keep the rule and say so on /about/how.
6. **The doubtful climates** (Cedrus deodara, Haemanthus pumilio, Echinopsis cuzcoensis). Recommended: no new rule now. Look at them again after Part 2's pass, which may change their records.
