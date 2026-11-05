# Round eighty-five: three reviews, and what was put right

Cultifolio is live with round eighty-four's Worker (`63ab1f88`) over corpus `8520c2875b2699ba`, 48,357 species pages, every page derived again by round eighty-four's code (the walk). On 31 October 2026 three reviews of that state came in:

- the internal deep review, `review-85/w.md`, `p.md`, `d.md`, `c.md` and `s.md` (the desktop grower, the phone grower, the data, the code and the search);
- outside review A, `review-85/outside-a.md`, condensed with every address, line and figure;
- outside review B, `review-85/outside-b.md`.

Seven agents worked on `r85base` (`08094db`, the owner's head), each on its own files:

- **K**, the add form and the plants' names;
- **E**, the species page and its words;
- **G**, geography, records and climate, and the maps;
- **N**, names, the index, search and the online fills;
- **U**, the collection, the frame, the service worker and operations;
- **A**, the about pages, NOTICE and the glossary;
- **Q**, the tests themselves;
- **M** merged them, settled what each asked of the others, proved the result, and wrote the owner's walk.

Their reports are in `review-85/` as `K.md`, `E.md`, `G.md`, `N.md`, `U.md`, `A.md`, `Q.md` and `M.md`.

**The order the owner runs.** Step 1: the merged Worker deployed over today's corpus; every Worker-side change is right over it. Step 2: every page derived again offline on the PC, the new pages and the online fills, the index, the checks and the upload; every derive-time and index-time change reaches the pages then, and the Worker of step 1 reads them. The column "Step" says which brings each fix.

## 1. The reviews' findings, and what was done

### Where all three agreed

| Finding | Who | Done | Step |
|---|---|---|---|
| A renamed page's old address says "the GBIF backbone accepts" Kew's name (W1, P1, C1, A1) | E | `was-words.ts`: the line says whose verdict the name is, by the record that holds it ("Ceropegia alstonii is GBIF's name for this plant, and GBIF's backbone accepts it. Kew's World Checklist holds it as a synonym of *Hoodia alstonii*, which heads this page: the reference takes its names from Kew"); tested on all 77 renamed dossiers the reviewers saved, and in the browser | 1 |
| An accepted name drawn as "An older name of" another species; the first Add press lost (S1, P2: the blocker) | K | `picker-rows.ts`: the line only for a name no page heads and a page holds as an older name, never from `hom`, a merged page first; over the live index round 84's rule drew it on 2,872 headings, this round's on 0 | 1 |
| The 0.05° margin admits records on another region's land (D4, A5, A6, B1) | G | The border rule (decision 1): a record inside any region's shape is that region's; the margin, the coast reach and the islands only for a record on no region's land, in that region's stated country. Khor Fakkan, Tweed Heads, Vientiane, Bukavu and Fujairah are out | 2 |

### Found by two of the three

| Finding | Who | Done | Step |
|---|---|---|---|
| A plant filed under GBIF's name for a page's key has no page (C4, S2, W9, A16a) | K | The index files a copy of each Kew-headed page's sheet under GBIF's name for its key (`via: 'gbif'`), taken only for a plant of that key; the plant page says how it found its page and offers to file it under the page's name; a name kept as typed after the form named its page carries it (`olderOf`) | 2 (copies), 1 (the rest) |
| The live check passes on a miss; the zone serves 14,400 s (C5, A18, B5) | U | `live-check-cache.mjs` asks each of `/api/index` and `/api/counts` until the edge answers from its cache, and judges that answer; the dashboard step comes first in the walk (decision 9) | 1 |
| The register says "nothing to report" for extremes read and set aside (A8, S8) | G, E | The build records them `ok` with "read, and set aside: …" (G); the page shows a stored "nothing to report" as answered, with the reason (E) | 1 (display), 2 (record) |
| The habitat line below the first screen (B3, P3) | E | On phones: the name, one English name, a folded line for the rest, Add, then the habitat; measured whole above the bar at 320×568, 320×700 and 375×667 | 1 |
| 44 px for shortcuts and help controls (B4, P4, A16g) | E | "Figures ›", the few-records link, the DLI help and the page's help links take a 44 px hit area under a coarse pointer | 1 |
| The record sample is the file's first rows (S3, D11) | G | Every distinct 0.05° cell first, by a fixed hash of the record's id; GBIF's search asks region by region past its pages (decision 5); /about/how says so | 2 |
| Stale passages and false examples on /about/how (S4, A21, D11) | A | The examples are tested against the index that goes live: `--index` writes their fixture and the counts the page states, and prints any it answers otherwise | 1, then each `--index` |
| /about/how too long (S11, A22) | A | Each section is a plain summary; the rules are folded under "The rules in full"; visible words 14,880 → 4,156 on how and about 20,300 → 746 on formats | 1 |
| A renamed page's range note says Kew holds X as a synonym of X (D2, A2) | E | `rangeNote` names the name the range was reached by, and says nothing where Kew's entry is the heading's own | 1 |
| Kew's family on a renamed page (A9a) and Kew everywhere for names (D1) | N | `kew-names.ts` places every GBIF name by Kew's rows; names Kew places only in another plant (`name.kew.elsewhere`) leave the page's search names and addresses, and (the merge) its shown older names; Kew's family heads every `k` page | 2 |
| The front page's photograph-failure looks, and the chip's "not checked" for pages not asked (W11, S9) | A, M | One word for one state: "not asked" for a page with no GBIF key, "not checked" for a source that did not answer, on the chip too (the merge, below) | 1 |
| Thin pages' typical cell read where the plant does not grow (A5, D12) | G | The border rule; and the few-records notice names the typical spot's place ("The typical spot … is in São Paulo, Brazil") | 2 (data), 1 (words) |

### The internal review

| Finding | Who | Done | Step |
|---|---|---|---|
| W2, A11: "Trichocereus pachanoi" found by neither the form nor "Is it an older name?" | N, K | `held` built from binomials only; the plant page says "a name below it, Trichocereus pachanoi f. peruvianus, is an older name of Echinopsis macrogona"; after step 2 the name is San Pedro's own page | 2, 1 |
| W3: the range fill at 1.16:1 against land | G | `--map-range` at 3.16:1 (light) and 3.4:1 (dark) against land, the edge in the accent | 1 |
| W4, D9, A20: island close-ups coarse, dots off the coast, labels colliding | G | Per-region files drawn at 0.005°, islets kept; labels tested where drawn; coast and island records drawn as rings, with a key | 1 (maps), 2 (rings' data) |
| W5, A16e: the month table loses months on desktop and in print | E | Months as rows, figures as columns: 640 px on a desktop, whole on A4; print asks for the gallery | 1 |
| W6, A9g, A16c: the lead photograph | E | `heroOf`: a stated size at the floor first, the first photograph of its observation first; GBIF's unsized media only after; an upright lead shown whole | 1 |
| W7: no way from the desktop tray to compare | U | "pick one more ›" links to /compare; "Remove from compare" once in the tray | 1 |
| W8: a genus tile "loading…" for ever | U | A genus tile is captioned "genus" | 1 |
| W9: "not in the reference" for an older name | K | "no page under this name" | 1 |
| W10: a second pasted list leaves new plants out | K | One press adds the lines matched before as new plants | 1 |
| W11: round 83's polish left | M | Counts in words ("10 plants", not "× 10"); a plant page's card with no photograph spans the column; a tile's English name set as a name, the family in small capitals; compare's and the catalogue row's failed photographs say so in the box; the three failure looks now say the same words | 1 |
| W12: words and numbers | E, M | One unit system in the elevation cause; the rain bar to 48 in; the credit's date unbroken; a true minus in the month table (E). "(1 in 100" never broken on a label; "sp." roman in a row's italic line; the add form's key pill says what it is in its title (M). Today's frost line already carries its day ("… (2026-11-09, MET Norway).", `forecast.ts`, tested by `r82d-frost-bar`): a misreading. `/labels` drew its preview under "Opening your collection…" and the list's arrival pushed it down; the preview is drawn once the collection is open, the footer waiting, as My plants' does: 0.039 → 0.000006 here (M) | 1 |
| W13, S9: "none read" on pages without GBIF's records | E, A | "GBIF's records not asked", "not asked · see under the name", "Not compared: … GBIF's records were not asked" | 1 |
| W14, P7: the crumb cut without an ellipsis | U | Parts whole, the last ellipsised; the name alone at 480 px and under; not drawn at 640×400, where the five places are | 1 |
| P5, A16b: the list under the pinned bar; a typed name cannot reach the next field | K | The list measured against the visual viewport and every pinned bar; a name typed in full narrows it to its own rows | 1 |
| P6: the chart at 200% text | E | Drawn at the shown width divided by the reader's text scale; no tick meets another | 1 |
| P8: units mixed in the extremes notice | E | One unit system, said once | 1 |
| P9: the iPad placeholder under the card | E | The words sit where the card leaves room | 1 |
| P10: a cold species page shifts its actions | E | The lines above Add cannot re-wrap as fonts arrive: CLS 0.026 → 0.003 | 1 |
| D3: renamed pages keep answers asked under GBIF's old name | N | `--list-renamed` and `--keys` ask Wikidata, Wikipedia, iNaturalist and Commons again by Kew's name, resumably | 2 (online) |
| D5, A15, S10: 14 old addresses 404 | N | An address two pages hold goes to the page whose heading it was; GBIF's name for a page's own key to that page; former headings kept as addresses; the 7 of 501 old headings not reaching their page now do | 1, 2 |
| D6: `g` pages under Kew's names | N | A page whose range note is a spelling or synonym takes that entry: 11 re-keyed on the reviewers' 906 | 2 |
| D7, A9b: autonym headings | N, M | An autonym entry is its species' (Stapelia hirsuta, Huernia barbata); a subspecies' parent is no older name of it (N). An autonym's page says it has no author of its own (M) | 2, 1 |
| D8: climates mixing hemispheres | G | Any poleward cell on the smaller side is left out, and said | 2 |
| D10: shapes-file metadata printed | E | "(Natural Earth's provinces, placed in TDWG's regions; shapes rule r84)" | 1 |
| D12: doubtful climates (Hibiscus syriacus from 3 records in Taiwan) | G | A rule-based answer, not a hand edit: the few-records notice names where the typical spot is, so a reader sees "eastern Taiwan" beside the figure | 2 |
| D13: residue | N, M | "Beet" heads Beta vulgaris alone; Hereroa incurva's genus; credits read again (the former display names) (N); the credits' fill also reads the captive mark again, so a photograph now marked captive is no longer shown as wild (M). "Chestnut" on Pochota fendleri stays: Catalogue of Life's name, given twice; no rule takes it without taking true names (N's decision 8). Indigofera taiwaniana's missing climate is honest (1 cell placed); the walk no longer promises one | 2 |
| P's performance (round 84's P5) | G, U | Each page fetches its own regions' outlines: 554 kB of map files on every page → median 10 kB; the tab bar no longer measures its labels in hydration | 1 |
| S5, A14: "tulip", "baobab", "saffron", "Sulcorebutia" | N | A Name-group hit holding the word in its own common name is ranked among the common names; growers' counts break ties; an older genus alone lists its own genus first | 1, 2 (`grown`) |
| S6: two-letter typos, nothogenera, non-English names | N | `nearestGenus` within 2 letters (1 under 7); exact shorter readings; "x Gasteraloe" no longer read as "gasteral"; and (the merge) the picker offers that reading as the search does | 1 |
| S7: the picker against the search | K | „…“, «…», ‚…‘, ‹…›; the genus and an epithet's start; "Under another genus" only when not found by a common name | 1 |
| S12: non-English names | N | `latinName` drops names with ð, þ or æ and a trailing modifier letter | 2 |
| C2: the reference's key wins | K | Leave, Enter and Add await the reference's search; a key the name service gave is replaced when the reference's row arrives | 1 |
| C3: one plant per Add | K | `saved` guards the save and both buttons | 1 |
| C6: a species page read before a deploy gone offline after it | U | The new worker reads the last 50 species pages again from the new server, with the species page's code, before it prunes | 1 |
| C7, A17: photographs not received said only in the console | U | The sync card says "N photographs were not received this run; asked for again at the next sync" | 1 |
| C8, A23: fixes no revert fails; no test for C2, C3 | Q, K | A component harness in Chromium (`tests/unit/helpers/mount.ts`); every listed fix has a test that fails with it taken back; `r85k 2`, `r85k 3` | tests |
| C9: the worker's comments | U | Say what happens; `/api/dossier/` among the never-cached routes | 1 |

### Outside review A

| Finding | Who | Done | Step |
|---|---|---|---|
| A3: the Poor Knights lily's own island outside | G | Natural Earth's 10 m minor islands (2,760 placed), or the stated country within 0.5° of the shape or inside its box (decision 2) | 2 |
| A4: Western Sahara, Darjeeling, Kermadec, Los Roques, Aru, Cocos | G | Split at 27°40' N; Darjeeling and Kalimpong to EHM; the islands placed; 17 orphan polygons placed by nearest shape. The Snares (TDWG files them NZS-OO) and Kenting (records off Natural Earth's own coast, by the margin): answered with the evidence | 2 |
| A7: the extremes flip on 0.7 °C | G | Set aside only beyond the correction's own 1.5 °C (decision 4); 24 of 84 set aside in the reviewers' sample come back at step 1 | 1, 2 |
| A9c: Kew's homonyms said as older names | N | Moved to `hom`: 173 on the live index | 2 |
| A9d: Kalanchoe × houghtonii "no record inside the range" | N, G | Found: the four Madagascar records were past the download's first 2,000 rows; the sample by cell brings them | 2 |
| A9e: Kalanchoe hildebrandtii, Haemanthus pumilio doubtful | G | As D12: thin pages say where their typical spot is | 2 |
| A9f, A16d, A22: OpenAlex's promise, build-log words, paths | E, A | "the reference does not ask OpenAlex for papers"; "(kept from this page's build of D)"; no flags; the about pages link files by plain names | 1 |
| A9h: a quoted name's route | E | "Wikipedia redirects X to Y" stated | 1 |
| A10: a 309-digit plant number hangs the form | K | `isPlantNumber` (32 characters, 15 digits in a row) everywhere; the loop bounded | 1 |
| A12: exact words first in the label | K | `olderNameOf` | 1 |
| A13: Add waits for the name service | K | 10 s at the device, 8 s at the server; the reference awaited apart | 1 |
| A16f: My plants shifts as fonts arrive | U | The backup line set in the metric-matched stand-in: CLS 0.2234 → 0.0000 at 375 px | 1 |
| A16h: arrow keys; the letter jump's busy state | U | Down reaches the matches; a busy letter says so | 1 |
| A19: the small points | U | The site name bounded on write; `localDateOf('YYYY-MM-DD')`; an unreadable `lastBackup`; the refold's failure said; every catch acts or says why (52 → 0, a test holds it) | 1 |
| A23: the check covers every contributing cell; the basionym's narrow path; `kew-names.ts` un-heading | G, N | Each record's reason counted and read by `--check-ranges`; Kew's other record of a basionym takes the range away only when the ranges differ; every un-heading listed with why | 2 |
| A24: the three simplifications | K, U | One resolver with the two promises apart and the 10 s timeout (K); plant numbers of a known shape (K); every product file written atomically and verified at `--index-ready` (U) | 1, 2 |
| A, performance | G, E, U | Per-region map files; the phone keeps the 500 px lead; measured in section 5 | 1 |
| A20's scripts-off chart | E | Two drawings before the width is known, 340 and 720, CSS showing one | 1 |

### Outside review B

| Finding | Who | Done | Step |
|---|---|---|---|
| B1: Cordyline's NSW record | G | Inside NSW's shape, so NSW's (decision 1), whatever the country | 2 |
| B2: two Hibiscus credits drifted | N | `--fill credits` reads every iNaturalist and Commons credit again, with its day; run live on Hibiscus: corrected to "Casey Clark G. Sumalinog" | 2 |
| B3, B4 | E | Above | 1 |
| B5 | U | Above | 1 |
| B6: "San Pedro" omits the intended page | N | Echinopsis pachanoi gets its own page (decision 6), its English names from its own sources: the scratch walk's page reads "San Pedro Cactus" | 2 |
| B's operations note: an interrupted upload | U | `upload-partial.json` from the first copy to the manifest; `--status`, every run and `--prune` say it | 2 |
| B's withdrawn NEL finding | — | Withdrawn by B itself; nothing to do | — |

## 2. The owner's decisions

Ten, taken by the coordinator on the owner's instruction, each built on: the border rule (1), islands too small to draw (2), TDWG's scheme exactly (3), the extremes' 1.5 °C (4), the fair sample (5), Kew everywhere and the new pages (6), credits' dates (7), summaries' revisions (8), the edge cache (9), no hand edits (10). Each is in the brief and in the agents' reports; /about/how states every rule they change.

## 3. The merge

Seven branches on `r85base`, merged into `r85m` with `--no-ff` in the order G, N, E, K, U, A, Q, as `M <m@m>`. Conflicts, each resolved keeping both intents:

- `src/lib/core/lapse.ts` (G, E): E's one-unit elevation sentence with G's "by more than the 1.5 °C (2.7 °F) a correction can be out by" on the two disagreement checks;
- `scripts/build-dossiers.ts` (N and K; U and A): N's index entry type with K's optional GBIF name; U's product writer with A's examples fixture;
- `src/routes/+page.svelte` (K, U): U's genus tile with K's "no page under this name";
- `src/routes/about/how/+page.svelte` (K, A, U, N): A's summaries with K's six name rules, U's offline sentence and N's 486 hybrids;
- `docs/DEPLOY.md`: both sides each time;
- Q against E: `r82f-found-not-shown` (Q's behavioural test replaces the source read E had updated) and `r84e-species-words` (both kept).

**What the reports asked, settled.**

- **A's 55 marked sentences**, each read against the merged code, the marks removed. Corrected: the border rule's country is the admitting region's, as G's code tests, not any native region's; the Snares and Kenting are not "placed" (TDWG files the Snares under NZS; Kenting counts by the margin); the 1-in-100 night's sentence matches the code's; the credits' day is each photograph's own where recorded, else its source's; the summary carries its day and its revision; GBIF's search asks within each region's box; an extra key read through the search is sampled as the page's own key (that was false: the merge made it true, `extraOccurrences` passes the boxes). "In brief" says a page shows what its sources said on the day it was built.
- **A's chip.** The catalogue counts `notAsked` (no GBIF key) beside `notChecked`, which keeps its sum for a server built before; the front page says "920 not asked" over the live index, and "N not checked or not asked" over a catalogue file written before (which cannot tell them apart).
- **N's fields displayed** (`fields-n.md`): Kew's family is `name.family` (E's page shows it); `photos[].read` and `summary.revision`/`read` were already E's; `name.kew.elsewhere` was not filtered on the page: now it is (`$core/shown-names.ts`, the page and its server), so Echinopsis macrogona no longer lists Trichocereus pachanoi after step 2.
- **Readable by an older app, and in /about/formats:** K's `olderOf` (an accession field; an older build passes it through, `FIELD_TYPES`), the sheets' `via` and `page` (an older app reads a copy as the page's sheet, as it did merged copies), G's admission counts and N's fields (optional; the schema's objects drop what they do not name), the index's `grown`, `blocks.json`'s `grown`, `older-genera.json`, `name.gbif.family`. Each is named on /about/formats.
- **N's 18 new pages and their records.** See decision 1 in section 4.
- **The batched build lost the summary's revision.** Wikipedia's TextExtracts batch did not ask for the revision, so a batched build wrote none (`r78b-batch` failed on equality). The batch now asks for `lastrevid` (`prop=…|info`).
- **One behaviour each:**
  - *The old-name words:* E's `wasLine` on the species page, K's `foundBy` on the plant page and K's picker line agree: GBIF's name is GBIF's, the heading is Kew's, and only a name no page heads is called an older name.
  - *The extremes' words:* E's `causeSentence`, with G's margin inside it; one sentence everywhere.
  - *The lead photograph:* E's `heroOf` chooses among whatever photographs a page holds, the renamed pages' new ones (N's `--keys` by Kew's name) included.
  - *"Not asked":* A's glossary sense, everywhere: E's page, K's plant page, the chip, compare, the label, the meta description, the builder's own line ("the other 14 say why GBIF's records were not asked").

**Faults found in the merge**, each fixed and tested:

- **The picker offered nothing for "Copiapao cin"** (`smoke-3`): N's genus reading answers `relaxed: "Copiapoa cin"`, which K's `offeredReading` refused. `genusReading` offers it as a similar spelling.
- **Nine browser tests and thirteen unit tests read the round before's behaviour**, each brought to this round's: K's reference-first check (`r66y 3`, `r70p P1`), U's crumb (`smoke-2`), E's verdict line and credit links (`smoke-3`, `r78b`), A's folded rules (`r75g`), E's two drawings (`r85q-behaviour`), N's Kew name passed to Commons (`r69k`), the chip (`r82u 3`, `r84u A13`), the disclosures A and E added (48 on the about pages, the phone's folded names), the fold hash (K's number paths), the offline words (U), G's margin under E's register test.
- **A former heading lost by a rebuild.** `--fill kew-names` writes `name.formerly` when Kew's entry for a page changes (Stapelia hirsuta var. hirsuta to Stapelia hirsuta), but a later build of the page wrote it without, so the plan's renamed pages' rebuild would have left `/species/stapelia-hirsuta-var-hirsuta` answering 404. Every build now keeps the page's former headings; checked on the scratch walk (rebuilt by `--keys`, the heading kept, the index holding it as an older name).
- **K's "They are new plants: add all N" added nothing.** The lines it offered stayed marked dropped (`markSheet` drops a line imported before), so Add read 0 plants. They are taken back undropped, with their own count; `r85m 5` presses it in the browser (it had not been run in one).
- **The new pages would have said the general reason.** Their lines were not in `scripts/extra-keys-kew-none.txt` (made 22 October); see section 4, 1.
- **Two waits that waited for nothing.** `waitForFunction` given an async predicate, or one that returns a promise, reads the promise as truthy and returns at once (checked: a predicate resolving `false` after 1.5 s returned). `smoke-3`'s wait for End's scroll was one: a Shift+Tab pressed during the animation was carried under the top bar, the one failure of a whole run in round eighty-four and twice in this round (traced: scrollY 1,567 → 10,722 after the press). `snapshotSaved` in `helpers/inject.ts` was the other. Both poll the page now, and a guard in `r85m-merge` refuses the pattern (it fails on `r85base`: both).
- **K's `stored()` reads in two specs** read a line once after the page moved on, which WebKit's IndexedDB on the PC can write later: polled now.
- **A fixed sleep and a bare Chromium tag** in U's CLS spec, which Q's guards missed because the test is written in a loop's line: the sleep is a wait for the page gone quiet, the tag `chromiumOnly` with its reason, and the guard reads loop lines now.

The merge's own tests: `tests/unit/r85m-merge.test.ts` (8: shown names, the autonym, not asked apart, extra keys by region, the captive mark, the picker's genus reading) and `tests/e2e/r85m-merge.spec.ts` (5: /labels holds still, "2 plants", compare's failed photograph, the chip's "not asked", the second paste), each failing on `r85base`.

## 4. Decisions taken for the owner

1. **The 18 new pages read no records moved from the page GBIF folds them into.** The rule the brief proposed (records GBIF files under a name Kew holds as this species' synonym belong to this page, and leave the page GBIF folded them into) is sound in principle: it follows Kew's synonymy, as every other rule here does. It is not provable here at full size. It is the same case as 643 pages without a GBIF key that round eighty judged "lumped" and left with their holders; applying it to 18 and not to them would be two rules for one case, and applying it to all 657 moves records out of about 600 holder pages' climates, which needs GBIF's backbone export and the download, neither here, to count and check. So N's judgement stands, plainly said: the merge ran round eighty's rule (`kew-extra-keys.ts`, the same code) for the 18 with GBIF's API in place of the export. 14 are lumped, and each page says so by name: "GBIF's backbone files this species' own names (… Echinopsis pachanoi …) under Echinopsis macrogona, a species with its own page here, which Kew's World Checklist accepts apart from this one: GBIF lumps what Kew splits; GBIF's records under those names are on that page, and a record is shown on one page only." 4 (Acaena echinata, Ixia fuscocitrina, Nymphaea amazonum, Viola stipularis) read a GBIF key of their own name and author, so they get records: on the scratch walk, Ixia 10 open records and Viola 351. San Pedro: GBIF holds 410 records under Trichocereus macrogonus var. pachanoi and its synonyms (GBIF's API, 31 October), of Echinopsis macrogona's 639; moving them is the next round's decision with the export in hand.
2. **The front chip's two counts**, as above: `notChecked` keeps its meaning for an older server.
3. **The captive mark read again by the credits' fill** (D13): the same request, one more field; the page then shows what iNaturalist says now.
4. **W11's polish done in the merge**, not left a third round.
5. **The agents' own judgements, accepted:** G's admitting-region country, islands by box, Darjeeling's two lines; N's merged names kept, "Chestnut" kept; K's 15 digits, `olderOf` as a field, headings instead of per-row words; E's Kew-named verdict line, the phone's fold; U's catch rule, C6 by re-reading, the upload said rather than atomic; A's one tap per list; Q's harness and ceiling.
6. **Renamed pages asked again by Kew's name lost what an older combination's item gave** (found on the owner's run of (c), 2 November; fixed by H). About 508 pages headed by Kew's accepted name were rebuilt asking Wikidata by their GBIF key and Kew's identifiers for that accepted name only, so an item filed under an older name of the same plant was refused: Sabdariffa acetosella lost Q5750828 (Hibiscus acetosella, its basionym) and its summary, Ceropegia dodomaensis Q88970625 (Brachystelma tanzaniensis, the name it replaced), Pseudo-fumaria lutea the article "Pseudofumaria lutea" (Q159014, Corydalis lutea), Artemisia chinensis iNaturalist's 355020; seven Kew entries IPNI does not hold linked their basionym's IPNI record. And the build said Wikipedia was asked "by Kew's name first, then by GBIF's" where it asked Kew's name alone. The rule now, by Kew's file alone: the names it holds with the same type as the page's entry (its basionym or the name a replacement name replaced, the names moved from it, the synonyms Kew marks homotypic, each filed under the entry). With no item by the GBIF key or the entry's own identifiers, the item carrying Kew's IPNI or POWO identifier for one of them, the basionym's of two, else none; an article whose item is the page's or carries one of them; the iNaturalist taxon such an item gives, one or the basionym's item's, before any name search; then Kew's name and GBIF's, as the record says. A page that is Kew's entry links Kew's IPNI record of its name or none. Each record names the name and why ("found by Kew's identifier 559896-1 for Hibiscus acetosella Welw. ex Hiern, which Kew holds as this species' basionym (same type)"); a synonym on another type (Hibiscus eetveldeanus) is never read, an item found by the entry's own identifier still wins, and Hoodia triebneri, whose only candidate item shares its label, stays without one. The pages without a GBIF key, `--fill wikidata` and `--fill summaries` read it too (the fills from the build's record). `tests/unit/r85h-homotypic.test.ts`, on Kew's and Wikidata's real rows; the walk's step (c′).
7. **The check's island box had no half-cell allowance** (found on the owner's run of (c), 3 November). `--check-ranges` named Peperomia leptostachya and Pandanus tectorius for one climate cell each at 22.625 S, 152.825 W: records on Rimatara, which TDWG's Tubuai Is. holds and Natural Earth does not draw, taken by the island rule inside Tubuai's box (west edge 152.823 W). The check tested the cell's middle against the bare box; every other reason's reach already adds half a cell's diagonal (0.036 degrees), and now the box does too (`cellReached`; `tests/unit/r85m-island-box.test.ts`, which fails without it). The records were right; the check was not.
8. **The credits fill and the day's allowance, deleted observations and photographs read before** (found on the owner's credits runs, 3 to 5 November). At iNaturalist's day's allowance the fill went on, every request refused unsent, and said "not answered … in an hour"; it now stops and says "tomorrow, after midnight UTC" (`tests/unit/r85m-credits-allowance.test.ts`). Three observations deleted on iNaturalist (HTTP 410) were left "not answered" for ever: a whole answer that lacks an observation asked now drops its photographs and says why. And a photograph read on an earlier day was counted "not answered" on every page still being read (940 of the last run's 950); it was not asked, and is passed by (`tests/unit/r85m-credits-gone.test.ts`).

## 5. What was proved

- **Each agent's new tests fail on the base.** A worktree at `r85base`, the new files copied in:
  - **unit:** 13 files sampled across all eight agents; 57 tests fail by assertion and 12 pass. The ones that pass are guards and round-84 revert tests, which pass on the base by design (Q's `r85q-reverts`, `r85q-press-kind`). Two files fail as files, their modules or the r85 shapes file absent (A's about test, G's border). The behavioural failures, by agent:
    - K: `r85k-by-key` 2 of 4;
    - E: `r85e-species-words` 17 of 17;
    - G: `r85g-climate` 8 of 9;
    - N: `r85n-search` 8 of 9, `r85n-addresses` 3 of 4;
    - U: `r85u-frame` 4 of 4, `r85u-live-check` 7 of 7;
    - Q: `r85q-sleeps` and `r63h-engines`' new guards, 4 of 4;
    - M: `r85m-merge` 8 of 8.
  - **browser:** Chromium against a build of `r85base`, no retries, the new specs of A, E, G, K, U and M. **38 of 40 fail**; the two that pass are guards (the crumb at 1280 px, the name service failing with the search held).
- **The whole unit suite, alone, under `nohup`:**
  - first: 584 files, 5,270 passed, 13 failed (section 3), 10 skipped, 668 s;
  - at the final code: **585 files, 5,295 passed, 0 failed, 10 skipped, 622 s**.
- **Types:**
  - `tsc --noEmit -p .`: 0 errors;
  - `svelte-check --threshold error`, alone: 1,510 files, 0 errors, 0 warnings, 39 s;
  - the builder under `tsconfig.scripts.json`: the 8 errors the base has, no more.
- **The whole browser suite, strict, Chromium and its phone:**
  - first: 803 passed, 9 failed and 1 flaky (section 3), 5 skipped, 28.7 min;
  - second: 820 passed, 1 failed (`r81a W6`, the merge's first /labels fix, which pushed the preview off the first screen; replaced) and 2 flaky (`r82d`'s ten-second toast and `smoke-3`'s 2.4.11 walk on /about/how, each now waiting for its state), 5 skipped, 27.7 min;
  - third: 822 passed, 1 flaky (`smoke-3`'s 2.4.11 walk again: the wait above), 5 skipped, 25.9 min;
  - final: **823 passed, 0 failed, 0 flaky, 5 skipped, 25.3 minutes**, the first try of every test.
- **The specs read for the ways specs have failed only on the PC** (the 51 new or changed specs):
  - every spec that routes a request blocks the service worker;
  - the one `mouse.wheel` (`smoke-3`, round fifty-five) runs on the desktop projects only;
  - CDP only in tests marked `chromiumOnly` or listed with their reason;
  - no fixed sleep without its reason (Q's guard; U's one made a wait by the merge);
  - K's IndexedDB reads after a navigation are polled for the very line (the merge).
- **Step 1, the deploy over today's corpus.**
  - **What was served:** production builds of the merge and of `r85base`, under `wrangler dev`, over the live index (48,357 entries) and the reviewers' 908 saved live dossiers, in a local R2 bucket.
  - **Status:** merge 906 × 200 and 2 × 503; base 905 × 200, 1 × 404 and 2 × 503. The 503s are the reviewers' `x-` files, whose key holds no dossier, a refusal said in both. The 404 is ceropegia-tanzaniensis, which N's D5 rule now answers.
  - **Bad words:** no page holds "undefined", "NaN" or "[object Object]".
  - **Read on the pages:**
    - Hoodia alstonii: Kew's verdict line;
    - Cedrus deodara: its record low again (the 0.7 °C gap);
    - a page without GBIF's records: "GBIF's records not asked", naming where they are;
    - the front page: "No climate, 9,789, 920 not asked".

  | Page | Base | Merge |
  |---|---|---|
  | Sempervivum tectorum | 180,421 B (40,228 gz) | 192,231 B (42,094 gz) |
  | Echeveria elegans | 138,868 B (29,517 gz) | 150,832 B (31,480 gz) |
  | /about/how | 173,359 B | 188,374 B |
  | /about/formats | 162,130 B | 166,867 B |
  | the front page | 103,619 B | 104,794 B |
  | all 908 pages | 109.9 MB (23.6 gz) | 118.3 MB (25.1 gz), +7.6% |
  | map files fetched by a species page | 554,098 B, every page | median 10,230 B, p90 88,710 B (G) |

  The HTML grew by the chart drawn twice for a reader without scripts, the gallery's credits and days, and the phone's folded names. A species page's bytes fell by about 540 kB a visit, the maps.
  - **Sizes,** `wrangler deploy --dry-run`, the same way: the Worker 2,034.57 → 2,084.98 KiB (519.46 → 532.03 gzipped); client JS 112 → 113 files, 1,474.6 → 1,521.4 kB (518.6 → 532.1 gz); CSS 175.1 → 180.4 kB.
  - **The live site:** not read (0 requests). Its figures are the reviews'.
- **Step 2, the plan, as far as it runs here.**
  - **The corpus:** round seventy-seven's (8,947 pages), rekeyed. Kept: 400 pages by a fixed seed, and the named cases from the reviewers' live dossiers, 424 in all. There was no climate grid, no download and no backbone export, so the scratch plan was G and N's file without `--grid` and without `gbif-infra`.
  - **The steps,** run through `corpus-step.mjs --plan`:
    - backup;
    - the walk: 424 pages in 16 minutes, 1,375 GBIF API requests;
    - Kew's names, which stopped: "the index now holds fewer species than before", my subset. The count was set and the same command resumed;
    - the 18 new pages (124 requests). San Pedro: 12 photographs from its own iNaturalist taxon, its Wikipedia revision and day, "San Pedro Cactus" among its English names, and the reason naming Echinopsis macrogona. Ixia fuscocitrina 10 open records; Viola stipularis 351;
    - `--list-renamed`: 24 pages;
    - `--keys`, which stopped at `drops.txt` with 2 lines of the expected kinds (DEPLOY (c)), then `--go-on`;
    - summary revisions: 206 read, 10 refreshed;
    - credits: 286 pages, 9,566 credits read again, 1,570 corrected, 13 photographs dropped;
    - the index;
    - `--check-ranges`. All six counts 0. In-range records by reason: 100,164 inside, 4,699 by the margin, 616 off a coast, 443 on an island. Seven `fixed:`. Two `NOT FIXED`, the island lilies, whose climates need the grid; their island records are in range (37 and 56).
  - **Not provable here:** the climate grid, the download, GBIF's backbone export and the upload.
- **Requests made:**
  - the live site: none;
  - GBIF's API: 230 by hand, one a second, as `cultifolio-review/85`;
  - the scratch plan's builder, at its own pace under the project's identity: GBIF about 1,500; Wikipedia, Wikidata, iNaturalist and Commons for 18 + 24 + 206 + 286 pages.

## 6. The delivery

**Against `r85base`: 1,031 files, 819 added and 212 changed; 2 deleted, none renamed.** No file under the hard limits changed (`wrangler.jsonc`, `static/s/`, `docs/REVIEW-ROUND-5.md`, `package.json`, `package-lock.json`, `scripts/corpus-plan-full.txt`).

- **Deleted, by hand after extracting** (DEPLOY (a) 1): `static/app/maps/regions50.svg` (each page now fetches its own regions' files) and `tests/unit/fixtures/r84a-search-examples.json` (A's fixture, made at each `--index`, replaces it).
- **733 map files:** 732 new, `static/app/maps/w/w-<code>.svg` and `static/app/maps/r/r-<code>.svg`, one a region and scale (G; the `w-`/`r-` prefix because Windows cannot hold a file named `CON.svg`, Congo's code, which stopped the owner's first `git add`), and the world file `regions110.svg` changed.
- **The other 298 files:**

```
NOTICE
docs/DEPLOY.md
docs/PENDING-ABOUT-HOW-R79.md
docs/REVIEW-ROUND-85.md
docs/review-85/A.md
docs/review-85/E.md
docs/review-85/G.md
docs/review-85/K.md
docs/review-85/M.md
docs/review-85/N.md
docs/review-85/Q.md
docs/review-85/U.md
docs/review-85/c.md
docs/review-85/d.md
docs/review-85/outside-a.md
docs/review-85/outside-b.md
docs/review-85/p.md
docs/review-85/s.md
docs/review-85/w.md
scripts/about-examples.ts
scripts/build-dossiers.ts
scripts/corpus-plan-r85.txt
scripts/corpus-step.mjs
scripts/dev/r80a-tdwg-shapes.py
scripts/dev/r84g-region-maps.py
scripts/dev/r85k-held-fixture.py
scripts/extra-keys-kew-none.txt
scripts/extra-keys-kew.txt
scripts/folded-species-lib.ts
scripts/folded-species.ts
scripts/hybrid-names.ts
scripts/kew-names-load.ts
scripts/live-check-cache.mjs
scripts/live-check.mjs
scripts/offline-files.mjs
scripts/product-files.ts
scripts/species-list.txt
scripts/species-new-r85.txt
scripts/tdwg3-shapes.json
src/hooks.server.ts
src/lib/backup/replace.ts
src/lib/climate/provider.ts
src/lib/core/accession.ts
src/lib/core/dates.ts
src/lib/core/few-records.ts
src/lib/core/hybrids.json
src/lib/core/lapse.ts
src/lib/core/log.ts
src/lib/core/names.ts
src/lib/core/note.ts
src/lib/core/search-files.ts
src/lib/core/search.ts
src/lib/core/sheet.ts
src/lib/core/shown-names.ts
src/lib/core/sw-keep.ts
src/lib/db/collection.svelte.ts
src/lib/db/types.ts
src/lib/db/vault.ts
src/lib/dossier/batch.ts
src/lib/dossier/build-kew.ts
src/lib/dossier/build.ts
src/lib/dossier/bulk.ts
src/lib/dossier/catalogue.ts
src/lib/dossier/dedupe.ts
src/lib/dossier/extra-keys.ts
src/lib/dossier/gbif-alias.ts
src/lib/dossier/index-entry.ts
src/lib/dossier/infra-names.ts
src/lib/dossier/kew-heading.ts
src/lib/dossier/kew-names.ts
src/lib/dossier/photo-read.ts
src/lib/dossier/products.ts
src/lib/dossier/range-check.ts
src/lib/dossier/revision-fill.ts
src/lib/dossier/schema.ts
src/lib/dossier/sheet.ts
src/lib/dossier/sources/gbif.ts
src/lib/dossier/sources/openalex.ts
src/lib/dossier/sources/wikipedia.ts
src/lib/dossier/summary-fill.ts
src/lib/dossier/tdwg-shapes.ts
src/lib/import/check.ts
src/lib/import/commit.ts
src/lib/import/paste.ts
src/lib/import/plan.ts
src/lib/import/rows.ts
src/lib/map/regions-drawn.ts
src/lib/map/still.ts
src/lib/server/counters.ts
src/lib/server/dossiers.ts
src/lib/server/lookup.ts
src/lib/server/sync.ts
src/lib/server/synonyms.ts
src/lib/sync/engine.svelte.ts
src/lib/ui/Climograph.svelte
src/lib/ui/CompareBar.svelte
src/lib/ui/CompareButton.svelte
src/lib/ui/LocationPicker.svelte
src/lib/ui/NotChecked.svelte
src/lib/ui/Photos.svelte
src/lib/ui/Provenance.svelte
src/lib/ui/SpeciesName.svelte
src/lib/ui/SpeciesPicker.svelte
src/lib/ui/Today.svelte
src/lib/ui/about-counts-on.json
src/lib/ui/about-counts.ts
src/lib/ui/about-fold.ts
src/lib/ui/grow/demo-seed.ts
src/lib/ui/index.svelte.ts
src/lib/ui/keep-ask.ts
src/lib/ui/picked-name.ts
src/lib/ui/picker-rows.ts
src/lib/ui/ref/Glance.svelte
src/lib/ui/ref/HabitatLine.svelte
src/lib/ui/ref/credit-days.ts
src/lib/ui/ref/head.ts
src/lib/ui/ref/lead-shape.ts
src/lib/ui/ref/notes.ts
src/lib/ui/ref/searched.ts
src/lib/ui/ref/upstream.ts
src/lib/ui/ref/was-words.ts
src/lib/ui/ref/words.ts
src/lib/ui/site.svelte.ts
src/lib/ui/sync-words.ts
src/lib/ui/theme.css
src/routes/+layout.svelte
src/routes/+page.server.ts
src/routes/+page.svelte
src/routes/about/formats/+page.svelte
src/routes/about/how/+page.svelte
src/routes/api/dossier/[key]/+server.ts
src/routes/api/names/+server.ts
src/routes/api/search/+server.ts
src/routes/api/sheets/+server.ts
src/routes/backup/+page.svelte
src/routes/compare/+page.svelte
src/routes/labels/+page.svelte
src/routes/offline/+page.svelte
src/routes/plants/+page.svelte
src/routes/plants/[acc]/+page.svelte
src/routes/plants/import/+page.svelte
src/routes/plants/new/+page.svelte
src/routes/settings/+page.svelte
src/routes/species/[slug]/+page.server.ts
src/routes/species/[slug]/+page.svelte
src/routes/sync/+page.svelte
src/service-worker.ts
tests/.r75h-harness-22802/a.spec.ts
tests/.r75h-harness-22802/browsers/firefox-1543/firefox/firefox
tests/.r75h-harness-22802/browsers/webkit-2359/pw_run.sh
tests/.r75h-harness-22802/pw.config.ts
tests/.r75h-harness-22802/runs/b.spec.ts
tests/.r75h-harness-22802/runs/pw.config.ts
tests/e2e/helpers/disclosure-list.ts
tests/e2e/helpers/disclosure.ts
tests/e2e/helpers/engines.ts
tests/e2e/helpers/idb-count.ts
tests/e2e/helpers/inject.ts
tests/e2e/helpers/press-kind.ts
tests/e2e/helpers/settled.ts
tests/e2e/r62ba-interface.spec.ts
tests/e2e/r62bq-picker.spec.ts
tests/e2e/r62w-pages.spec.ts
tests/e2e/r63fv-front.spec.ts
tests/e2e/r63fv-guard.spec.ts
tests/e2e/r63v-visitor.spec.ts
tests/e2e/r64f-firefox.spec.ts
tests/e2e/r64w-engines.spec.ts
tests/e2e/r66y-engines.spec.ts
tests/e2e/r67h-budget.spec.ts
tests/e2e/r67h-disclosure.spec.ts
tests/e2e/r67h-engines.spec.ts
tests/e2e/r67h-places.spec.ts
tests/e2e/r67p-pages.spec.ts
tests/e2e/r67r-places.spec.ts
tests/e2e/r67v-example.spec.ts
tests/e2e/r69p-disclosure.spec.ts
tests/e2e/r69p-takeover.spec.ts
tests/e2e/r69x-example.spec.ts
tests/e2e/r70p-save-moves.spec.ts
tests/e2e/r70x-example.spec.ts
tests/e2e/r73p-first-visit.spec.ts
tests/e2e/r73p-toast.spec.ts
tests/e2e/r75g-most-grown.spec.ts
tests/e2e/r75h-progress.spec.ts
tests/e2e/r78b-literature.spec.ts
tests/e2e/r79k-no-gbif.spec.ts
tests/e2e/r80u-back.spec.ts
tests/e2e/r80u-layout.spec.ts
tests/e2e/r80u-offline.spec.ts
tests/e2e/r81h-hybrid-tiles.spec.ts
tests/e2e/r81u-a11y.spec.ts
tests/e2e/r81u-phone.spec.ts
tests/e2e/r82d-record.spec.ts
tests/e2e/r82u-pages.spec.ts
tests/e2e/r84a-about.spec.ts
tests/e2e/r84e-species.spec.ts
tests/e2e/r84g-maps.spec.ts
tests/e2e/r84k-picker.spec.ts
tests/e2e/r84u-frame.spec.ts
tests/e2e/r85a-about.spec.ts
tests/e2e/r85e-species.spec.ts
tests/e2e/r85g-maps.spec.ts
tests/e2e/r85k-add.spec.ts
tests/e2e/r85k-plant.spec.ts
tests/e2e/r85m-merge.spec.ts
tests/e2e/r85q-press.spec.ts
tests/e2e/r85u-frame.spec.ts
tests/e2e/r85u-plants-cls.spec.ts
tests/e2e/smoke-2.spec.ts
tests/e2e/smoke-3.spec.ts
tests/unit/climate.test.ts
tests/unit/fixtures/about-search-examples.json
tests/unit/fixtures/r78b-batch-recorded.json
tests/unit/fixtures/r85e-photos.json
tests/unit/fixtures/r85e-renamed.json
tests/unit/fixtures/r85k-held-headings.json
tests/unit/fixtures/r85q-source-text.json
tests/unit/fold-rules.test.ts
tests/unit/helpers/Nothing.svelte
tests/unit/helpers/mount-entry.svelte.ts
tests/unit/helpers/mount.ts
tests/unit/note.test.ts
tests/unit/products.test.ts
tests/unit/r62bw-words.test.ts
tests/unit/r62w-words.test.ts
tests/unit/r63h-engines.test.ts
tests/unit/r67r-import.test.ts
tests/unit/r69k-index-seam.test.ts
tests/unit/r70c-photo-kind.test.ts
tests/unit/r70c-second-pass.test.ts
tests/unit/r70p-about-rules.test.ts
tests/unit/r70p-about-seams.test.ts
tests/unit/r71f-about-70bc.test.ts
tests/unit/r74-growers.test.ts
tests/unit/r74-spaces.test.ts
tests/unit/r75g-opening-rule.test.ts
tests/unit/r78b-batch.test.ts
tests/unit/r78b-literature.test.ts
tests/unit/r78m-list-build.test.ts
tests/unit/r78s-species-list.test.ts
tests/unit/r79f-about-how.test.ts
tests/unit/r79k-list-route.test.ts
tests/unit/r79k-schema.test.ts
tests/unit/r79m-kew-keys.test.ts
tests/unit/r80a-lapse.test.ts
tests/unit/r80n-wikidata-names.test.ts
tests/unit/r80r-no-key.test.ts
tests/unit/r80x-held-range.test.ts
tests/unit/r80x-occ-memory.test.ts
tests/unit/r81a-care-groups.test.ts
tests/unit/r81h-hybrids.test.ts
tests/unit/r82f-found-not-shown.test.ts
tests/unit/r82f-wikipedia-cut.test.ts
tests/unit/r82m-merge.test.ts
tests/unit/r82u-pages.test.ts
tests/unit/r83a-merged-address.test.ts
tests/unit/r83c-climate.test.ts
tests/unit/r83w-weight.test.ts
tests/unit/r84a-about.test.ts
tests/unit/r84e-species-words.test.ts
tests/unit/r84g-maps.test.ts
tests/unit/r84g-walk-check.test.ts
tests/unit/r84m-cell-tester.test.ts
tests/unit/r84m-merge.test.ts
tests/unit/r84n-names-index.test.ts
tests/unit/r84n-search.test.ts
tests/unit/r85a-about.test.ts
tests/unit/r85e-species-words.test.ts
tests/unit/r85g-border.test.ts
tests/unit/r85g-climate.test.ts
tests/unit/r85g-maps.test.ts
tests/unit/r85g-records.test.ts
tests/unit/r85k-by-key.test.ts
tests/unit/r85k-names.test.ts
tests/unit/r85k-older-line.test.ts
tests/unit/r85m-merge.test.ts
tests/unit/r85n-addresses.test.ts
tests/unit/r85n-credits.test.ts
tests/unit/r85n-folded.test.ts
tests/unit/r85n-kew-names.test.ts
tests/unit/r85n-search.test.ts
tests/unit/r85q-behaviour.test.ts
tests/unit/r85q-guards.test.ts
tests/unit/r85q-picker.test.ts
tests/unit/r85q-press-kind.test.ts
tests/unit/r85q-reverts.test.ts
tests/unit/r85q-sleeps.test.ts
tests/unit/r85q-source-text.test.ts
tests/unit/r85q-species-page.test.ts
tests/unit/r85u-catches.test.ts
tests/unit/r85u-frame.test.ts
tests/unit/r85u-live-check.test.ts
tests/unit/r85u-offline-files.test.ts
tests/unit/r85u-products.test.ts
tests/unit/r85u-sw-carry.test.ts
tests/unit/r85u-upload.test.ts
tests/unit/sheet.test.ts
```

## 7. The owner's walk

`docs/DEPLOY.md`, "Round eighty-five: the owner's walk", (a) to (f).

## 8. What is left

Of the reviews' findings: nothing. Each is fixed by rule with its test, or answered with its evidence (section 1).

What remains is what only the PC can run, and it is the walk's own steps, not work left:

- **WebKit and Firefox.** This machine has Chromium only; (a) 2 runs every engine.
- **The plan at full size.** It needs the climate grid, the download and GBIF's backbone export; that is (c) to (e).
- **The about pages' examples over the new index.** The plan's `--index` tests them and prints any it answers otherwise; that is (d) 4.

Two judgements stand as decisions, with their reasons, rather than work:

- San Pedro's records (section 4, 1);
- U's front-page blocking time. It measured within the machine's noise of the base (229 against 247 ms median), with the one script-forced layout removed. Deferring the collection module for a visitor would move the layout's static imports, which U judged unsafe in a final round, and so do I.

One class of test is held by a rule, not converted: 153 assertions on code text in 53 files. Q's ceiling only falls, so none can be added and each conversion lowers it. Each guards a builder or worker step that a behavioural test would have to drive on fixtures, one at a time, as `r78i-build` does. They are listed in `tests/unit/fixtures/r85q-source-text.json`.
