# Round eighty-six: three reviews, and what was put right

Cultifolio is live with round eighty-five's Worker (`ba32fc3e`) over corpus `48c27bf790016ccc`, 48,375 species pages, at head `e185eed`. Three reviews of that state:

- the internal deep review, `review-86/w.md`, `p.md`, `d.md`, `c.md` and `s.md` (the desktop grower, the phone grower, the data, the code, the search);
- outside review A (its scores and findings were read into the plan; its text is not kept in the repository);
- outside review B, `review-86/outside-b.md`, condensed with every address, line and figure.

Six agents worked on `r86base` (`e185eed` plus the coordinator's first three fixes), each on its own files: **names** (old addresses, the add form, GBIF's name), **maps** (deferred maps, offline maps, labels, the strip, phone layout), **words** (the about pages and the pages' words), **ranges** (the admission policy, shapes, islands, Kew's area text), **sources** (cultigens, Wikipedia, GBIF credit days, common names, San Pedro, a 404) and the coordinator, who merged them, settled what each asked of the others, and wrote this record and the owner's steps.

## 1. The findings, and what was done

| Finding | Who | Done | Step |
|---|---|---|---|
| A single photograph's credit has no read day (B1) | coordinator | `Photos.svelte` says the lead's credit and its day for one photograph or many; the page renders it for one; rendered tests for none, one and many | 1 |
| A failed source row becomes a credit's read day (B2) | coordinator | `credit-days.ts`: only an answered row lends its day; else "on a day not recorded"; a test per status | 1 |
| Settings' choices cut at 200% text (B3) | coordinator | Every segmented choice wraps its words, and its group wraps, site-wide; settings' choices are equal columns; a browser test measures each segment's words at 320, 375 and 414 px | 1 |
| The rich page's phone LCP 5.6–5.8 s (B4, P9) | maps | Below-fold maps asked for near the viewport (print and no-IntersectionObserver draw at once); the strip's thumbnails wait for the lead. Local throttled Monstera: median LCP 5,072 → 4,416 ms (maps), → 3,160 ms (strip) | 1 |
| "Quoted as written" is the summary service's text (B5; our bracket finding) | words, sources | The words say what is shown today; the summary fill now quotes the article's opening paragraph as written, with its revision, and the credit says which each page holds | 1 (words), 2 (quotes) |
| A record with no country admitted by margin or coast (B6, D4) | ranges | One typed admission policy (`admission-policy.ts`) read by the derivation and the check, its words (`policyWords`) held equal to /about/how's hand-written sentences by a test; no country, no margin or coast admission; D4's 0.02° same-country allowance by the stated state | 2 |
| Old addresses lead through GBIF to the plant Kew does not give the name to (C1, D3) | names | Kew's own older-name lists answer first; GBIF's answer never leads to a page whose record holds the name for another plant; the 404 says what Kew holds | 1 |
| The old-address line depends on a data centre's cache (C3) | names | Read from the page's own record (`name.infra`) | 1 |
| A record that cannot be read on the 404 path answered as "no page" (C5) | names | "Not checked", `no-store` | 1 |
| A name below species cut to another species' binomial (S: `canonicalSynonym`) | names | Every rank word read | 1, 2 (index) |
| Enter then Add files a plant with no key (C2, S3, P5) | names | Arming only after the check concludes; one press files; a cross, a cultivar of a genus and a qualified name never armed | 1 |
| GBIF's name for a renamed page called "older name" (W1, P10, P12) | names | "GBIF's name for X" on every surface; the index's new `gname` field for search and import rows | 1, 2 (index) |
| "You grow" tiles say "not in the reference" (W2) | names | The plant page's older-name / GBIF's-name look | 1 |
| A renamed page links GBIF's name's Wikidata item (D11) | names, sources | `crossIds` takes the item carrying Kew's identifier; the renamed pages rebuilt | 2 |
| Maps blank offline after an update (C4) | maps | The coastlines installed; each carried page's map files kept; a read page hands the worker its map files | 1 |
| Close-up labels outside their region (P1) | maps | Labels only at points inside the region's own outline (`region-labels.ts`) | 1 |
| Phone polish (P2, P3, P4, P7) | maps | The habitat head on narrow screens, a long author wraps, the sources grid held to the card | 1 |
| The about pages false or stale (S4 and its table) | words, all | The sentences S4's table names, and those each agent's change touched, checked against the code; every agent's change said where it applies | 1 |
| Other words (W5, W9, W11, W14, W15, S15, "wild plants lead", "outside the WCVP native range", the place name's source and Crimea, a common name re-cased, `isScheme` width) | words | Fixed as listed in the words agent's report | 1 |
| Sync: after Replace the page reopened on the new-key form (B, journeys) | coordinator | A key made before the replace is not offered again; the page says what the replace did | 1 |
| Cultigens shown with a wild habitat (D1) | sources | Read from Kew's area text; said "(as a cultigen)", no habitat climate | 2 |
| GBIF credits dated by the walk (D5) | sources | The download's day | 2 |
| New pages' iNaturalist match drops the rank word | sources | Kew's names read without the rank word, as iNaturalist writes them | 2 |
| Common names (peyote, dragon fruit, false roselle) | sources | NCBI's rows with no language searched, never shown; a phrase shortened only after a genus | 2 (index) |
| A 404 read as "none" from any source (`fetch.ts:174`) | sources | 404 is an error unless the endpoint's 404 means "no such record" | 2 |
| Monsonia lheritieri (D12) | sources | Kew's answer stands offline; rebuilt | 2 |
| ISO codes BQ, SJ, MF, BV, CP; Kashmir; the island reach at a foreign coast; Stapelia hirsuta's range; Howea's sea cells | ranges | Fixed; the PAK and WHM map files regenerated | 2 |
| Xeronema's typical spot (D2) | ranges | Held open, never called fixed; Kew's words for the range shown beside it | 2 |
| Ranges Kew gives wider than a region (Mexico, Brazil, Malesia) | ranges | Kept and said in Kew's words; 8 pages listed by `scripts/dev/r86-wide-origins.ts` | 2 |

Step 1 is code over today's corpus; step 2 needs the corpus steps below.

## 2. Decisions

- **The owner's, after the dry runs:** San Pedro's records (D6): the rule moves the records GBIF files as *Trichocereus macrogonus* var. *pachanoi* (homotypic in Kew's file) from *Echinopsis macrogona* to *E. pachanoi*; adopted 7 November (429 keys on 338 pages); the walk applies it. Wikidata's English names for keyed pages (S2): kept off, as decided before.
- **The ranges agent's settings, left at their defaults:** a record within 0.02° of a same-country border that names no state is admitted; the island reach stops at another country's land; review D's D8 (open sea inside a mainland region's box) stays open.

## 3. Left for a later round

- Homonyms said by their authors (D13): needs Kew's author per row in `--fill kew-names`.
- The border allowance reads a state it cannot match (old province names such as Natal or Transvaal, US postal codes) as no state; aliases are needed (final review M2; 26 records on 11 pages in the dry run).
- The 337 older-name strings outside review B could not match directly: classify (descendant, citation form, other).
- W12 (`/labels` shift): not reproduced at 376 plants locally.
- The browse feature set (the plan's C): next, on this round's code.
- From a look at another grower's app (Plantistry, 7 November): "At home, aim for" targets worked out by stated arithmetic from each page's sourced habitat figures, DLI and PPFD among them; a named hybrid's parents' habitat figures side by side where the parentage is sourced; adding a room of plants one photograph at a time; search tests for the names that app does not find (older names, common names, GBIF's names, typing errors).
- The look, before the browse pages are built: the front page leads with one real figure and its trail rather than a slogan; fewer cards and shadows; the serif for scientific names only; no emoji or counters; an about page in the owner's words on who made it and how AI was used; a data page and the round records as a changelog. Mocked beside the current look first.
- A "Commons graph filter" item in the plan had no source in any review and was dropped.

## 4. The owner's steps

1. Before extracting the code: `copy scripts\tdwg3-shapes.json shapes-r85.json`.
2. Extract the zip, check the md5 list, `node scripts\predeploy.mjs`; commit when it says to deploy (do not deploy yet).
3. `node scripts\corpus-step.mjs --plan scripts\corpus-plan-r86.txt`: dry runs, a review stop (paste the totals), the walk, the online rebuild of the renamed and keyless pages, the summary and genus fills, the index and the check, a second review stop.
4. At the walk's stop (drops.txt: Conophytum tomasii's range, which an offline walk cannot read, and Sorbus lingshiensis's failed request): both pages, and the 272 pages of the final review's S1 and M1 (scripts/rebuild-r86-holders.txt), were added to scripts/rebuild-r86-d12.txt, so the plan's online `--keys` builds them and its `--index` and `--check-ranges` follow them. `--go-on`.
5. At the second review stop: `node scripts\predeploy.mjs`; commit when it says to deploy (the files in round86f-add.txt); `npm run deploy`, then `--go-on` for upload and the live check.

## 5. The final review, and what was put right (7–8 November)

While the walk ran, five more reviews read the round's code before it was published: the user-facing code, the data pipeline, the about pages against the code, and two looks at other references and trackers. Agents fixed each finding on its own branch; the coordinator merged them and ran every unit test (5,533 passed) and the browser suite.

| Finding | Done | Needs |
|---|---|---|
| A below-fold map or a lazy gallery photograph printed blank: Chromium does not wait for a file asked for in `beforeprint` (U1) | Maps drawn and photographs loaded once the lead has loaded and the browser is idle; the browser test reads the printed PDF | code |
| The Kew-holder address ignored the rank word: `aloe-bus-var-cus` went to a page holding *Aloe bus* subsp. *cus* (U2) | Rank words compared, as canonicalSynonym reads them | code |
| A "You grow" tile or a plant page said "an older name of" when the copy saying it is GBIF's name was not reached (U3) | "The reference files it under" until it is known | code |
| The batch form and the plant page's edit saved before the name's check (U4; C2 on two more paths) | They check under the press, as Add does | code |
| A page opened with `?was=` answered 503 when the holder's search file was not read (U5) | The page shows; the holder "not checked", `no-store` | code |
| D6: the holder kept the given-away keys' GBIF photographs (S1: 36 of 81 on *E. macrogona* are San Pedro's) | Left out in the build, both fills of GBIF's photographs and the download path; said on the row | 272 pages, in the plan's online `--keys` (step 4) |
| A refused Wikidata answer took GBIF's name's item as `ok` (S2) | Not checked; the previous ids kept | code, before the online `--keys` |
| `--fill genus --force` wrote "refused" over a good quote (S3) | A good record kept; the failure counted and said | code, before the fill |
| A DOUBTFUL key that comes with a variety's key was read by neither page (M1: *Salix lucida* subsp. *lasiandra*, 2,306 records) | Filed under the key it comes with | in the same 272 pages |
| Eleven sentences false, stale or overstated: OpenAlex named as a source, care-group minimums, the island exception, the dev port, `npm run select`, Wikipedia's twenty a request, D6 still pending, rows 20 and 32 above, "collects nothing", the coast reach's country, the state that decides a border | Each made exact against the code | code |

At the `--keys` stop (8 November), nine drops, each read: seven pages' photographs fell by more than half, six of them holders whose GBIF photographs of another page's records are now left out (S1, said on the row), and Ceropegia elegans, which lost its Commons files because the build asks Commons only while it holds fewer than twelve photographs, counted before the same photograph is taken once (its 11 iNaturalist photographs remain); Weingartia glomeriseta's Wikidata item is now the one carrying Kew's identifier for its basionym (D11), not the one found through GBIF's older name; Delphinium × barlowii's IPNI identifier was counted lost under GBIF's name before Kew's heading gave it back (the written page holds 710426-1, as before). And the walk's record showed GBIF's photographs' source said twice on about two pages in three ("from the GBIF download …; from the GBIF download …"), from D5's change: the build writes it once and the page shows a part said twice once (`readerWords`).

At the second stop (8 November), the check: 0 faults, eight fixed, Xeronema held open; r86-wide-origins, the 8 pages listed. A read of every page's summary title found 1,355 quoted under another title than the page's name, all a spelling, an older name, the page's own item's article, its rank or a genus of one species, but four: Mentha ×rotundifolia, Salix ×pendulina, Begonia metallica and Amelanchier stolonifera quoted another plant's article (M. longifolia, S. babylonica, B. incarnata, A. ×spicata), reached through Wikipedia's redirect from their own names and carried by walks since 22 October; and one page, Conophytum calculus subsp. vanzylii, still listed 7 papers carried from September. The five were put right by hand before the index (fix-r86-pages.mjs, its lines in fix-r86-pages.txt). A carried summary keeps no proof in its record, and a walk carries papers: both for a later round.

Held open: the border allowance's unmatched state (section 3); the Commons count taken before duplicates are dropped (Ceropegia elegans); the drops audit reading a renamed page before Kew's heading (Delphinium); an offline walk writes "none" for a page Kew holds no row of whose range came from GBIF's older names, which only an online build asks (Conophytum tomasii, the walk's drop): the online build puts it right, and an offline walk should keep the range it had. Checked at the stop: whether any page still lists papers (about/how says none does; an offline walk carries `literature`).

The restyle mocked as plan D8 was chosen on 7 November (desktop, phone and dark); the browse pages are built in it.
