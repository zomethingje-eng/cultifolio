# Round eighty-four: three reviews, and what was put right

Cultifolio is live with round eighty-three's code (the Worker from `ba78fb9`) over corpus `e8885155673882ba`, 48,357 species pages. On 29 October 2026 three reviews of that state came in: the internal deep review (`REVIEW-SELF-84.md`, with `review-84/w.md`, `p.md`, `d.md`, `c.md` and `s.md`: the desktop grower, the phone grower, the data, the code and the search), outside review A (`review-84/outside-a.md`, Chromium, 68 species) and outside review B (`review-84/outside-b.md`, Chromium, WebKit and Firefox, 61 dossiers). The coordinator checked each claim and wrote the triage (`REVIEW-TRIAGE-84.md`). The owner said: "Do everything that you possibly can do, make the best decisions and I will take your recommendations."

Six agents worked on `r84base` (`ba78fb9`), each on its own files:

- **K**, the add form and the names a grower types;
- **E**, the species page and the climate's words;
- **G**, geography: the regions, the records and the maps, and the whole-corpus walk;
- **N**, names, the index and search;
- **U**, the collection, the app's frame and operations;
- **A**, the about pages and NOTICE;
- **M** merged them, settled what each asked of the others, proved the result, and wrote the owner's walk.

Their reports are in `review-84/` as `K.md`, `E.md`, `G.md`, `N.md`, `U.md`, `A.md` and `M.md`.

**The order the owner runs.** Step 1, the merged Worker deployed over today's corpus: every Worker-side change is right over it. Step 2, every page derived again offline on the PC, the index, the checks and the upload: every derive-time and index-time change reaches the pages then, and the Worker of step 1 reads them. The column "Step" below says which brings each fix.

## 1. The reviews' findings, and what was done

### Where all three agreed

| Finding | Who | Done | Step |
|---|---|---|---|
| The reason for extremes set aside is wrong (D1, S1, A3) | E | `lapseCause` names which of three checks applied: a weather cell over 1,000 m above or below the spot, or the cell's nights and the habitat's monthly lows disagreeing (a record low, or a 1-in-100 night, warmer than the coldest month's mean low). The glance card, the sheet, the climate notice, a plant's page, compare and the share card all read it | 1 (a plant's page names the cause from step 2's sheets) |
| 125 regions tested by their box (D2, A2, W1) | G | 366 of 369 regions have a shape; the three left are Christmas I., Cocos (Keeling) Is. and the South China Sea; a box takes the shape's 0.05° margin | 2 |
| /about/how stale and too long (S4, S5, A18, A19) | A | both about pages rewritten for a grower: a summary of three sentences per section, rules in short lists, a glossary, the deepest lists folded (print opens them), no sentence over 60 words (the longest was about 1,280), live counts from `/api/counts` | 1 |

### Found by two of the three

| Finding | Who | Done | Step |
|---|---|---|---|
| Climates read through restricted records outside the native shape (A1, B1: Aloe vera in Fujairah, Ficus elastica in the Sundarbans) | G | every record is tested against the shapes, restricted ones included (already so at derive time; the faulty pages predate the shapes); no build without the shapes file; the record says the rule (`occurrences.rangeRule: "r84"`); `--check-ranges` lists any page whose typical cell lies outside its native regions and names the five cases | 2 |
| A cultivar under a genus filed as a hybrid (W5, A9) | K | "a cultivar, species not stated"; an old record filed so is read as written and its page offers "File it as a cultivar" | 1 |
| Print leaves out the cultivation sheets (W10, A11) | E | print opens them, by the style sheet where the engine can and by `beforeprint` everywhere | 1 |
| My plants shifts on a cold load (P2, A12, B4) | U | the footer waits for the list; the backup line is drawn under the search with the list; CLS 0.105 to 0.0000 at CPU ×4 with 400 plants | 1 |
| The Add press and the picker (C1, C2, A22) | K | the list opens only while its field has focus; a press outside closes it; `check()` never opens it; Add waits for the reference's own search; the room under the field is held under a press | 1 |

### The internal review

| Finding | Who | Done | Step |
|---|---|---|---|
| W1 regions drawn as rectangles | G | both maps draw the regions' simplified shapes from two static files kept a day; "Inside …" when one region holds the whole close-up | 1 |
| W2 the lead photograph and the first row | E | no lead under 640 px on its long side where a larger one exists; the first row takes one photograph per observer first. What a photograph shows (a hand, a weed being pulled) no rule can see | 1 (tiles 2) |
| W3 the glance grid | E | the four figures fill their row on a desktop | 1 |
| W4 a hit found by an older name says nothing | M | a common name now takes the words only by itself, so "Sansevieria trifasciata" lists Dracaena trifasciata "older name: Sansevieria trifasciata" | 1 |
| W6 an older name leaves a plant with no species page | K | Add asks once, naming the page; a plant already filed under one offers "Is it an older name?" and files it there in one tap | 1 |
| W7 "Where this page came from" looks closed | E | a turning "›" and "open" | 1 |
| W8 a restore still says "never" | U | a restore that counts as a backup is shown at once | 1 |
| W9 a blank field number reads "none" | K | "not stated" | 1 |
| W11 small inconsistencies | E | the rain bar runs to the next thousand above 1,200 mm; the floor nudge only to a grower who grows the species; the units switch hidden without scripts. Compare's photograph height, the "×" counts, the plant page's inset and the catalogue's caps line are left (section 8) | 1 |
| W12, P7, A7 sentences for the author | E | reworded for a grower; the rule's name stays in the "how" link | 1 |
| W13 the console error and the icons | U | the PNGs' C2PA chunk removed, pixels byte-identical; the manifest names the PNGs only | 1 |
| P1 the chart at 360 px | E | drawn at the measured width down to 260 px; labels at least 10 px (were 4.9) | 1 |
| P3 the notch in landscape | U | the top bar's controls inside the inset | 1 |
| P4 the compare pill everywhere | U | on species pages only | 1 |
| P5 the cold front page | U | measured: the largest cost is the first layout of the server's HTML, about the same whatever the page holds; no cut is safe without a real iPhone's timeline (section 8) | |
| P6 Back drops the Record draft | K | Back and Escape keep it, with "Open it"; Cancel drops it | 1 |
| P8 44 px targets open gaps | U | the finger's height as an invisible margin, not a taller line | 1 |
| P9 "from few records" only in a title | E | "from few records: 3 in 3 cells", linked to the notice | 1 |
| D3 Kew's name on `k` pages | N | decision 1: Kew's accepted name and authors head every `k` page; GBIF's name becomes an older name; no heading malformed | 2 |
| D4 Xanthoceras's carried records | G | records are carried only to a page whose key they were read under | 2 |
| D5 hybrids without Kew links | N | the missing one of POWO and IPNI from the Kew entry at display; every `k` page's own entry at the fill | 1 and 2 |
| D6 untrue data sentences | A, G | the sentences rewritten; each page's record names its range test and rule | 1 and 2 |
| D7 default points at a named place | A | decision 5: the rule kept and said | 1 |
| D8 weak lead photographs | E | as W2 | 1 |
| D9 generic one-word names | N | a one-word name several species of a genus share heads only the one its sources give most, none on a tie (`name.shared`); the search demotes a shared headline by photographs | 1 and 2 |
| C3 species pages gone offline after a deploy | none | works as documented: an update starts the copies afresh, and the about page says so | |
| C4 what the suites cannot see | all | each fix tested by behaviour where it could be; CDP tests tagged `@chromium` | |
| S2 the species named exactly by a shared word comes later | N | snowdrop 24 → 1, saffron 34 → 2, primrose 129 → 1, squill 54 → 1, stonecrop 116 → 1 | 1 |
| S3 a cultivar in ’…’ quotes | K | any of ' " ‘ ’ “ ” opens and closes a cultivar; an apostrophe inside a word does not | 1 |
| S6 /about/formats' counts and fields | A | the doc's eleven fields, the index entry's every field, the file counts by their rule | 1 |
| S7 a merged key "from Kew's synonymy" | E | "the key of a page merged into this one", no repository path (A6e) | 1 (words in the files at 2) |
| S8 the picker never says why | K | "has a species page; older name: …", "older name under another author: …" | 1 |
| S9 the picker drops catalogue rows | K | rows kept when the relaxed reading begins with the typed genus and epithet; quotes around the whole field are punctuation | 1 |
| S10 two-letter typos, misspelt genera | N | genera ordered by nearness; a query that finds nothing read again from fewer letters ("lithops lesleyi" is Lithops lesliei, said) | 1 |
| S11 tie-breaks | N | a shared headline with fewer photographs set back ("century plant" Agave americana 6 → 1) | 1 |
| S12 odd readings | N | "aster" no longer offers Easter Is.; no retry of a sentence; English names in another script not shown | 1 |

### Outside review A

| Finding | Who | Done | Step |
|---|---|---|---|
| 1 Aloe vera's cell in Fujairah | G | as A1 above | 2 |
| 2 Indigofera taiwaniana's 14 records "outside" | G | Taiwan has its shape; a box takes the margin | 2 |
| 4 Euphorbia × martini's summary cut mid-sentence | N | a summary that does not end a sentence ends "…" and links Wikipedia, at display and at derive time | 1 |
| 5 three doubtful climates stand | none | decision 6: no new rule; read again after the walk | |
| 6a "another author" with no author | E | "Same spelling, another plant", an author named only where the record gives one | 1 |
| 6b Monsonia lheritieri's two Kew records | N | a page whose own basionym Kew holds apart takes no range (narrowed to the basionym, section 4) | 2 |
| 6c Weingartia fidaiana | N | by decision 1: Weingartia fidana | 2 |
| 6d "Yugoslavia" on Picea omorika | none | WGSRPD's own name for the unit; left (section 8) | |
| 6e a repository path on Ferocactus hamatacanthus | E, M | the words fixed where written and where shown; M: a page whose only keys are merged pages' no longer says Kew's file holds them as this plant | 1 and 2 |
| 6f "none placed to within 10 km" counted places | G | counts records, says it is the rule's reading | 2 |
| 6g summaries carry no revision date | none | left (section 8) | |
| 6h weak strips and a small lead | E | the size floor; content no rule can see | 1 |
| 8 San Pedro not found | N | the names GBIF files under a species' varieties are searched as names (`name.infra`, `--fill gbif-infra`) | 2 |
| 10 "not checked" eight times | E | said once per source; sections point to it | 1 |
| 13 smaller trips | E, U, N, M | the credit's licence once; the bar; the floor nudge; the switch without scripts; the restore sentence's space; the chip read in one phrase; the strip (decision 4). M: the storage toast in a grower's words. Left: the search box's ArrowDown, the letter jump (seen once) | 1 |
| 14 "backup −1 d ago" | U | one rule for an instant against a local day, and a test that no `slice(0, 10)` of an instant comes back | 1 |
| 15 `offline-tried` missing from "every key" | A | listed; the test's pattern takes hyphens | 1 |
| 16 sync's TypeError, a 5xx photograph, the frost window, the site name, silent catches | U, K | `NotReached`; the run goes on; from now; 120 characters; each catch says something; the add toast says a failed watering line | 1 |
| 17 no navigation at 640 × 400 | U | the five places in the top bar | 1 |
| 20 NOTICE | A | every source, its licence and its address | 1 |
| 21 an upload over a stale index | G | the upload asks `--index-ready` first | 2 |
| 23 simplification | U | one time rule; `NotReached` | 1 |

### Outside review B

| Finding | Who | Done | Step |
|---|---|---|---|
| 1 climates from outside the native range | G | as A1 | 2 |
| 2 the extremes rule "calls a valid series impossible" | E, A | decision 7: said as a check that two sources disagree, not a proof | 1 |
| 3 the phone's first screen | E | decision 3: "Habitat in short" above the photographs | 1 |
| 4 My plants' layout shift | U | as P2 | 1 |
| 5 the number ledger outside the log | U | a Replace writes the numbers it keeps into the log (`numbers-kept-…`) | 1 |
| 6 NEL not disclosed | none | refuted: /about/how names it | |
| 7 touch targets | U | as P8 | 1 |
| 8 maps' captions not tied | E | `aria-describedby` | 1 |
| 9 `/api/index` cached four hours | U | not reproduced; the live check now fails on a lifetime over five minutes and says the zone setting | 1 |
| 10 the page weight | M | measured (section 5) | |
| 11 listings skip unreadable dossiers | G | they stop and name the file | 1 |
| 12 a filtered run "may go ahead" | U | predeploy's last line follows what was run | 1 |

## 2. The owner's decisions

1. Kew's accepted name heads every `k` page (N).
2. One offline re-derivation of every page (G's walk, with N's fills).
3. A compact habitat line on the phone's first screen (E).
4. The front page's strip from the "Popular genera" (N).
5. Default points at a named locality with no stated accuracy stay out, said (A).
6. No new rule for the doubtful climates now.
7. The extremes rule stays; its words say it is a check that two sources disagree.

## 3. The merge

Six branches on `r84base`, merged into `r84m` with `--no-ff` in the order G, N, E, K, U, A, as `M <m@m>`. Every shared file merged cleanly but `docs/DEPLOY.md`, where each conflict kept both sides; each merged passage was read again (`bulk.ts`, `build.ts`, `build-dossiers.ts`, the species page and its server file, the plant page, `theme.css`, `sheet.ts`, `extra-keys.ts`, `+layout.svelte`, `search.ts`, the about pages).

**The needs, settled.**

- **A's sentences that named another agent's code** (55 places, marked in the source): each read against the merged code, the marks taken out. Corrected:
  - a plant under the old heading: its key still leads to the page, and its old name too, *except where Kew's file holds that name for another plant* (k3313620's Ceropegia tanzaniensis);
  - "Is it an older name?" is a press, not a look the page makes by itself (K's rule), and the privacy list now says what it sends;
  - a hybrid's Kew links: given wherever its record lacks *either*, not only both;
  - a name with a letter of another script left anywhere is not shown (N's `latinName`), not only one with no Latin letter;
  - the record-low check worded as two sources disagreeing, like the warm-night one; "Neither of these two checks proves that either source is wrong";
  - the phone's box is "Habitat in short", as the page heads it;
  - the coast rule's reach is about 17 km, which is what 0.15° is (G wrote 16);
  - `occurrences.rangeRule` added to /about/formats;
  - "In brief" says that a page follows the rules of the day it was built, and names the rules of 30 October that reach a page only when it is next built.
- **U's sentences made untrue:** "within 72 hours of the forecast" is "within the next 72 hours"; the compare tray is out of the private pages' preload list (it is on species pages only). The `numbers-kept` record, the restore counted at once and the 120-character site name were already on /about/formats.
- **E's `details.unchecked-why`** is in `disclosure-list.ts`, with a setup on a page without GBIF's records (Hesperocyparis lusitanica).
- **G's coast rule, judged.** A record in no region's shape, at sea or on an islet Natural Earth does not draw, counts for the region whose drawn coast is nearest within 0.15°; a record on any region's land never does. I would defend it to a botanist: it is narrower than the box test it replaces (which took in any sea inside a region's rectangle), it never moves a record off land, and the one guess it could make, which of two coasts, almost never arises. On the 617 live dossiers it recovers 386 open records; only 10 had a second region's coast within reach, 9 of them both native, and the tenth (Capparis spinosa at the Princes' Islands, 7 km from Asian Turkey, 15 km from Turkey-in-Europe) went to the nearer shore, which is where TDWG puts those islands. Kept as written; /about/how states it.
- **N's edits in G's `bulk.ts`** (`viaOlderNames` given the page's own name, `basionymRecords`) and in E's `+page.server.ts` (`shared:` passed to `englishNames`): read; right over today's corpus, where `name.shared` is absent and the call is as before.
- **E's note for `build.ts`:** a page whose only GBIF keys are merged pages' (Ferocactus hamatacanthus) said its records were read "under GBIF's keys for the names Kew's file holds as this plant". `kewKeysWords` now says whose keys were read (step 2).
- **One behaviour where two agents changed the same thing:**
  - *The extremes' words:* E's `lapseCause` and its three wordings, everywhere a page, sheet, plant page, compare or share card says it; A's /about/how follows them; no other agent wrote such words. The builder's comments say the same.
  - *The lead photograph:* N chooses the front strip's species (decision 4), E's `heroOf` chooses each photograph, page and tile alike (the tiles' from step 2's index), so the strip and the species page lead with the same photograph.
  - *The picker's words:* K's, in the app; the about pages say K's rules (any quotes, a genus cultivar, focus, the older-name press).

**Faults found in the merge** (each fixed, each tested):

- **A species page scrolled sideways at 320 px with 200% text** (`r62ba N10`, `r67h engines 3`): E's season-card link "How the rain and temperature rules read …" kept to one line. It wraps under 641 px.
- **Eleven unit tests failed only once the branches met:** G's "no build without the shapes" stopped four older builder tests' folders (the merge gives them the file); N's stored Kew row was missing from the fixtures test; U's spec wrote a meta mark the harness test reads as a raw write (marked `raw-ok:` with its reason); /about/how's new geographic "place" words were unknown to the spaces guard. An E test guarded the old 300 px lead (E's 640 px floor wins, the guard rewritten); r70p and r79f read sentences A rewrote.
- **`smoke-3`'s frost night was fixed on 2 November**, outside the 72 hours U's bar now counts from now, so the test failed before about 10:00 UTC on 30 October and would have passed after. Now tomorrow, read when the test runs.
- **E's print test** asserted that a style sheet alone opens a closed `<details>`, which only Chromium and Safari can do (`::details-content`): Firefox on your PC would have failed it. The style-sheet half now runs only where the engine has the selector; the event half everywhere.
- **The walk's plan headed only the last run's pages.** The builder reads Kew's names and the varieties' names at the end of each run for the pages that run derived, so a walk stopped and resumed would leave the first run's pages headed by GBIF's name. The plan now reads both for every page after the walk (minutes each; a second run changes nothing).
- **A repository path on every page with records:** the default points' words said "…with no year: scripts/default-points.txt; …" in the record of sources (A6e's rule). Taken out where it is written and where it is shown.
- **W4, unassigned:** "Sansevieria trifasciata" listed Dracaena trifasciata without "older name", because a common name ("Snake Sansevieria") was read together with the hit's own epithet. A common name now takes the words alone.
- **A13's storage toast:** "This browser has not promised to keep your data" is now "This browser may clear your plants to free space: take a backup now and then."

The merge's own tests: `tests/unit/r84m-merge.test.ts` (17): `kewKeysWords`, the about pages against the code (the coast reach, the box margin, the regions' count, the older-name press, the frame's sentences, no marker left), W4 with guards, the default points' words.

## 4. Decisions taken for the owner

Taken by the merge where the owner had not decided, each with its reason:

1. **G's coast rule kept as written** (section 3): defensible, narrower than the box it replaces, and the ambiguous case is rare and resolved toward the nearer shore.
2. **The walk's plan reads Kew's names and the varieties' names for every page after the walk**, and stops when GBIF's backbone export is missing, rather than skipping San Pedro's names in silence: the file is on your PC, and the walk's first command checks for it.
3. **E's 640 px lead floor outranks the Commons title rule**: a 300 px file whose title names the species yields to a large one whose title does not. Both have passed every gate for being shown; a lead blown up past its pixels is the fault the reviews named.
4. **U's compare tray on species pages only, on a desktop too**: kept. Picks stay in the tray and reach Compare from the menu and the footer.
5. **K's old hybrid records read as written**, with the page's "File it as a cultivar" offer: kept; the log cannot tell the app's guess from a grower's choice.
6. **N's D9 keeps the clear favourite** ("Fig" on Ficus carica): kept; dropping it would break "fig".
7. **"Yugoslavia" stays** on the pages that WGSRPD's own unit name reaches (A6d): it is Kew's code's name; POWO's wording is POWO's.

## 5. What was proved

- **Each agent's new tests fail on the base** (a worktree at `r84base`, the new files copied in):
  - unit: 20 new files. 11 ran, 112 tests: 100 fail, and 12 pass, each a guard. 9 fail as files, their modules absent: A's about test, E's words, G's maps and records, K's names, N's heading and index, U's live check and predeploy.
  - browser, Chromium and its phone, no retries: the six new spec files, **48 tests, all 48 fail**.
- **The whole unit suite, alone, under `nohup`:**
  - first run: 554 files, 5,011 passed, 11 failed (section 3), 10 skipped, 529 s;
  - at the final code: **554 files, 5,026 passed, 0 failed, 10 skipped, 542 s**.
- **Types:**
  - `tsc --noEmit -p .`: no errors;
  - `svelte-check --threshold error`, run alone: 1,453 files, 0 errors, 0 warnings;
  - the builder under `tsconfig.scripts.json`: the 8 errors the base has.
- **The whole browser suite, strict, Chromium and its phone, no retries:**
  - first run: 740 passed, 3 failed (section 3), 5 skipped, 25.4 minutes;
  - at the final code: 742 passed, 1 failed, 5 skipped, 25.5 minutes; the one, `r60 14`, read the storage toast's old words (the merge's A13 rewording), and with its pattern updated it and `r82d-record` passed 24 of 24, no retry.
- **The specs read for the ways specs have failed only on the PC:**
  - every new spec blocks the service worker;
  - there is no `mouse.wheel`;
  - CDP is used only in tests tagged `@chromium` (U's layout-shift reading and the landscape notch);
  - the fixed waits are U's negatives and K's wait past the page's own leave timer, each with its reason;
  - K reads the stored key by polling the very line.

  Two fixed: E's print test (an engine without `::details-content`) and smoke-3's dated frost.
- **Step 1, the deploy over today's corpus.** The merged app served the 617 live dossiers the reviewers read, with the live index's entries for their 400 genera.
  - **Under `vite dev`:** all 617 species pages answered 200. None held "undefined", "NaN" or "[object Object]", and none the old extremes words. 46 said which check set their extremes aside; all had the phone's habitat line and the maps tied to their captions; 613 drew the regions' shapes, and the 4 others have no range. The search answered "snowdrop", "Sansevieria trifasciata", "lithops lesleyi" and "houseleek" as above.
  - **Production builds of the base and the merge, under `wrangler dev` over the same files:** 617 × 200 each. The HTML:

    | Page | Base | Merge |
    |---|---|---|
    | Sempervivum tectorum | 169,046 B (37,832 gzipped) | 174,446 B (38,834) |
    | Echeveria elegans | 128,875 B | 135,144 B |
    | all 617 pages | 73.23 MB | 76.18 MB (+4.0%) |
    | /about/how | 148,553 B | 173,310 B |
    | /about/formats | 132,900 B | 162,081 B |
    | the front page | 102,749 B | 102,076 B |

    The live site serves the first two at 174,671 and 130,546 B, with its full index.
- **Sizes against round eighty-three's** (`wrangler deploy --dry-run`, both built the same way):
  - the Worker: 2,033.98 KiB, 519.37 gzipped, against 1,960.73 and 503.51;
  - the app's scripts: 112 files, 1,474.3 kB (518.4 gzipped), against 111 files and 1,379.1 kB (494.2). The about pages' scripts grew 29.5 and 24.5 kB (their text is in them), and the species page's 25.2 kB;
  - styles: 174.5 kB (44.7) against 168.9 (43.6).
- **Step 2, the walk, as far as it runs here.** On the 617 live pages, `--list-walk`, then `--walk --offline` with Kew's files, the plan's two fills, `--index` and `--check-ranges`. This copy has no climate grid (climates pending) and no download, so the builder read their records from GBIF's API: 1,709 requests at its own pace.
  - **The walk:** 40 minutes; a peak of 1.72 GB.
  - **The headings:** 8 headings and 8 addresses changed, exactly N's eight; 73 pages linked to their Kew entry.
  - **The fills:** Kew's fill changed 0 after the walk's own; `--fill gbif-infra` stopped (exit 2) without the export, as it must.
  - **The check:** it listed 2 pages carried (section 3). Derived online, they were tested by r84, and Monsonia lheritieri lost Sarcocaulon spinosum's range by N's A6b rule. The check then read 0, 0 and 0, with Aloe vera, Galanthus nivalis and Melissa officinalis `fixed:`; Ficus elastica and Indigofera taiwaniana are not in the sample.
  - **Round seventy-seven's 8,940 pages:** Kew's fill took 1 minute 47 s and 1.43 GB, and headed 482 pages. A second run changed 2 more (Berberis repens's heading, Yucca luminosa's citation); a third changed 0.
  - **Not provable here:** the climate grid, the download and GBIF's backbone export.
- **The coast rule** on the 617 live pages: section 3.
- **Requests:** none to the live site. GBIF's API: 1,721, by the builder, as above.

## 6. The delivery

Every file added or changed since your tree (`ba78fb9`), as one zip extracted over the project folder: **225 files, 69 added and 156 changed; none deleted or renamed**, so there is nothing to delete by hand. The list, one path a line, is the merge's `M-s/delivery-files.txt`. No file under the hard limits changed: `package.json`, `package-lock.json`, `wrangler.jsonc`, `static/s/`, `docs/REVIEW-ROUND-5.md`, `scripts/corpus-plan-full.txt`.

| Where | What runs them on the PC |
|---|---|
| `src/routes/`, `src/lib/ui/`, `src/lib/core/`, `src/lib/map/`, `src/lib/db/`, `src/lib/sync/`, `src/lib/backup/`, `src/lib/import/`, `src/lib/share/`, `src/lib/climate/`, `static/app/` | the app and the Worker, with the deploy (a) |
| `src/lib/dossier/`, `scripts/build-dossiers.ts`, `scripts/kew-names-load.ts`, `scripts/corpus-step.mjs`, `scripts/tdwg3-shapes.json`, `scripts/corpus-plan-r84-walk.txt`, `scripts/corpus-plan-upload.txt` | the walk, the fills, `--index`, `--check-ranges` and the upload (c) to (e); the Worker reads the dossier code too |
| `scripts/predeploy.mjs`, `scripts/predeploy-scope.mjs`, `scripts/live-check.mjs`, `scripts/live-check-cache.mjs` | (a) |
| `scripts/dev/` | making the shapes and the maps again, by hand only |
| `tests/unit/`, `tests/e2e/` | `predeploy` and the deploy's gate |
| `NOTICE`, `docs/` | reading |

## 7. The owner's walk

`docs/DEPLOY.md`, "Round eighty-four: the owner's walk", is the whole of it, in order: (a) the delivery and the deploy; (b) round eighty-three's prune, if not yet run; (c) the walk; (d) the checks before the upload; (e) the upload and the live check; (f) cleaning up.

## 8. What is left

- **The doubtful climates** (Cedrus deodara, Haemanthus pumilio, Echinopsis cuzcoensis): decision 6; read them again after the walk.
- **Islands Natural Earth does not draw, more than 17 km from a drawn coast** (Rockall, Shag Rocks, remote Seychelles atolls, Europa): outside their regions until a minor-islands layer is a source. Christmas I., Cocos (Keeling) Is. and the South China Sea are still boxes.
- **P5, the cold front page on a phone:** no cut without a Safari timeline from your iPhone (U's report says what to record).
- **W11's remainder:** compare's photograph height, the "×" counts, the plant page's inset, the catalogue's caps line.
- **A6g, the summaries' revision dates;** A13's search box ArrowDown and the letter jump seen once; A21's suspicion that `--list-default-points` keeps a point listed with 0s (not reproduced here).
- **"living stones", "peyote", "moth orchid":** data the reference does not hold (genus common names; untagged languages).
- **What a photograph shows** (Crassula ovata's mis-captioned strip, Aloe vera's pulled plant): no rule can see it.
- **WebKit and Firefox:** every new and changed spec has run in Chromium and its phone only; your `predeploy --tier=app` runs them in every engine.
- **The species page's script** grew by about 25 kB (the phone's habitat line, the words, the regions' recognition table): measured in section 5; worth a look when the page's weight is next reviewed.
