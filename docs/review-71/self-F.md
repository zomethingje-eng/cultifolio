# Round 72, reviewer F: the first visitor, the about pages, the harness

Working copy `/tmp/claude-0/rev72/F` (r72base plus the trial fixes in `/tmp/claude-0/rev72/F-fix.diff`). Scripts and outputs in `/tmp/claude-0/rev72/F-work/`. Pages against the real corpus were rendered by a `vite dev` server in a second clone (`F-work/app`, at r72base) with `static/s` pointing at a copy of the corpus (`/tmp/claude-0/rev72/F-s`); the server falls back to the static corpus when its local bucket is empty, so this serves the live corpus with r72base code. Renders are in `F-work/pages/*.txt`.

## Findings

**1. The season card calls a frozen wet season a "winter growing season" (72 of 5,565 climate pages). Confirmed.**
`src/lib/core/sheet.ts:214` calls a wet season "winter" whenever its mean is half a degree below the year's, whatever the temperature. The top of the page then reads, for Rubus parviflorus, "Wet winters: the rain comes October to March, read as a winter growing season", with a wet-season mean of 4.1 °C and a cold floor of −16.7 °C. Across the corpus (`F-work/winter.py`): 1,267 pages read a winter growing season. In 72 of them the wet season has a month whose mean nightly low is below 0 °C, or a wet-season mean below 5 °C. In 5 the wet-season mean is below 0 °C: Colchicum kurdicum (−4.9 °C), Colchicum luteum, Pinguicula australandina, Scilla ingridiae and Lonicera involucrata. Others include Camassia quamash, Pinguicula macroceras (0.0 °C) and Monardella odoratissima. It is a labelled reading of a fixed rule, so rule 1 holds to the letter. But "growing season" is a claim about the plant, and /about/how says "None of this says when the plant grows". A grower will read it as wrong. Smallest fix (owner's decision): do not name a growing season when any wet month's mean nightly low is below 0 °C. Say instead "the rainy season, in the cold months: no growing season read". It needs a new state in `Year`; not written.

**2. /about/how says the stapeliads are here as Ceropegia because Kew's WCVP counts them so. Kew's file in this workspace does not. Confirmed.**
`wcvp_names.csv` accepts 77 Huernia, 60 Orbea, 31 Stapelia, 30 Caralluma, 20 Quaqua, 18 Duvalia, 13 Hoodia and 11 Tromotriche. The reference has 4, 1, 2, 0, 0, 0, 1 and 0 under those genera. 278 Ceropegia pages have a range note saying Kew holds the page's name as a synonym of a Huernia, Orbea, Stapelia, Echidnopsis or Caralluma (and so on). That note shows only in the "Where this page came from" table. `+page.svelte:609` shows the range source in the Habitat section only for the 12 notes that match `/under the name |, reached by /`. The other 469 of the 476 range-source notes appear only at the foot of the page. Ceropegia villetiae's page says "Native range as published by WCVP" and never says, near the top, that Kew calls the plant Stapelia villetiae. The 404 for a Huernia GBIF does not redirect says the genus is taken "whole as Kew's WCVP lists its accepted species", which is untrue for Huernia (4 of 77). 93 of the 173 "whole" genera hold fewer species than Kew accepts (886 in all; many are here under older names or in `unresolved.txt`).
The trial fix replaces the sentence (in the diff): "Ceropegia is taken whole, and since the names the list was derived from counted Brachystelma and the stapeliads (…) as Ceropegia, most of their species are here under that name. Kew's checklist now accepts most of the stapeliads in their own genera again: about 280 pages here carry a Ceropegia name that Kew holds as a synonym of a Huernia, an Orbea, a Stapelia or another such genus, and each says so in its record of sources, with the range of Kew's entry; the stapeliad genera the list names have only the few species the backbone files under them."
Also recommended: widen line 609's regex to `/under the name |, reached by |as a synonym of /`, with its own fixed clause, so the Kew-synonym note shows in the Habitat section.

**3. /about/how says "the IPNI and POWO links are Kew's number for the name and author wherever Kew holds one". That is untrue for 114 pages. Confirmed.**
`F-work/powo.py`, streamed over `wcvp_names.csv`, finds 98 pages with no POWO or IPNI link where Kew accepts the page's own name by exactly the page's own author. In 65 Wikidata has no item. In 23 Wikidata has an item but no identifier. In 10 the Wikidata row failed. Examples: Agave wendtii Cházaro (985456-1), Ariocarpus scaphirostrus Boed. (19065-2), Convolvulus cneorum L. (266046-1), Tulipa clusiana Redouté. Another 16 pages carry a name Kew holds as a synonym by the same author. The links come only from Wikidata (`ids` from the item). Fix in the builder: a fill that writes `ids.powo`/`ids.ipni` from `wcvp_names.csv` when the name and author match one row exactly. That also answers open issue 1: an identifier can be written by a fill and needs no `--keys` rebuild. Until then the sentence should read: "…are Kew's number for the name and author where Wikidata's item carries it; a page whose species Wikidata has no item for has no POWO or IPNI link, even where Kew holds the name."

**4. Rule 2: 19 pages whose Wikidata request failed show a shorter list of register links with no "not checked". Confirmed; trial fix with a test.**
Agave wendtii's "Names & registers" reads "GBIF iNaturalist" and nothing else. Its `wikidata` row is `error`, so it says "failed" only in the table at the foot. Ten are open issue 1's maxlag failures; nine have carried an error since 2026-09-19 (Agave wendtii, Brachystelma bilobatum, Othonna divaricata and six more) with no fill retrying them. The fix is `registersNotChecked()` in `src/lib/ui/ref/upstream.ts`, a "Registers not checked" pill in `.links`, and a test in `tests/unit/r72f-pages.test.ts`.

**5. The fixed clause "Kew holds no entry under this page's name" is false on 6 of the 12 pages that show it. Confirmed; trial fix.**
Kew holds Hibiscus acetosella Welw. ex Hiern, Echeveria peacockii Croucher ex T.Moore & Mast., Monsonia lheritieri DC., Ceropegia tanzaniensis Peckover, Cochemiea matehualensis (Backeb.) M.H.J.van der Meer and Monsonia mossamedensis Welw. ex Oliv. In each case it is another author's name by the rules, but not "no entry". Hibiscus acetosella's own record says, in the next row, "Kew holds Hibiscus acetosella only under another author". The trial fix reads "Kew holds no entry of this page's name by its author" (`+page.svelte:609`). No test: the fixture corpus has no such page.

**6. 51 of the 270 summaries quoted under another title name no proof, though /about/how says each does. Confirmed.**
For 23 the `wikipedia` row has no detail, and 28 carry a row that says only "carried …; this build: skipped". Examples: Callianthe megapotamica ("Abutilon megapotamicum"), Prosopis glandulosa ("Neltuma glandulosa"), Parrycactus flavovirens ("Ferocactus flavovirens"). Root cause: `summary-fill.ts:108` keeps a title that `summaryTitleFits` (an older name of the species) with `c.kept++` and writes no proof. The proof is real (the title is one of the species' older names) but unsaid. Fix, with no rebuild: when `summaryTitleFits(title, name, synonyms)` holds, Provenance says "Wikipedia's article <title>, one of this species' older names (GBIF Backbone)".

**7. Ixora coccinea still shows "Comm. ex Lam." beside an IPNI link to Ixora coccinea L. (open issue 2). Root cause confirmed.**
The dossier holds `authorship: "Comm. ex Lam."` and `ids.ipni: 753844-1`, which is Kew's Ixora coccinea L. The name Kew holds by Comm. ex Lam. is 753843-1, which Kew files under Embothrium coccineum. The page's author and its register link name two different names. The homonym-key rule runs only for an "orphan" usage (`build.ts:249`, `syn.data.length === 0`). GBIF's usage has one synonym, "Ixora coccinea Comm.": the same two words. Fix: `orphan = syn.status === 'none' || (syn.status === 'ok' && syn.data.every((x) => canonicalSynonym(x) === scientific))`, then a `--keys` run for 8793122. /about/how uses this very species as its worked example of the rule.

**8. iNaturalist's "photo processing" placeholder is stored as a photograph (Pseudophoenix sargentii, 1 page). Confirmed; trial fix with a test.**
Photo 8 of 40 is `https://www.inaturalist.org/attachment_defaults/local_photos/large.png`. That host is not in the page's `img-src`, so the gallery shows "did not load", and the index counts it. The fix drops such photographs in `shownPhotos` (`photo-kind.ts`); the test is in `r72f-pages.test.ts`. The builder should drop them too.

**9. Searching "Cactus" (or "cactus") puts two Copiapoa whose headline is "Cactus" above every real cactus name (open issue 10). Confirmed on the live site.**
Copiapoa cinerascens and C. serpentisulcata have "Cactus" as their only English name, so the exact-name rank puts them first. Only these two pages have a generic-noun headline. Other headlines a skeptical visitor will quote: Kalanchoe laetivirens "Crenatodaigremontiana", Bulbine asphodeloides "Copaiba" (a Copaifera name), Bulbine succulenta "Compass Kopieva". My recommendation: show no headline when the only English name is a generic noun (it stays searchable), and do not let an exact match on a generic noun outrank the other matches.

**10. First visit costs 150 to 217 requests and 1.0 to 1.7 MB, about half of it the service worker's precache. Confirmed on the live site.**
`F-work/firstvisit.mjs`, one visit per page, live site, fresh context:

| Page | Requests | Service worker | Total | Scripts | Fonts | Images |
|---|---|---|---|---|---|---|
| Front, desktop | 156 | 89 | 1,059 kB | 183 kB | 162 kB | 334 kB |
| Front, phone | 150 | 71 | 1,141 kB | | | |
| Species, phone (Copiapoa cinerea) | 217 | 159 (517 kB of fetches) | 1,672 kB | | | 633 kB |
| 404 | 109 | 75 | 645 kB | | | |

`src/service-worker.ts:41` precaches the whole build, the static files, the shells and `/` on install, on the first page of a visitor who may only read one species. Recommendation (owner's decision): register the worker only after the visitor's second page, or once they add a plant or open "My plants", and precache only the shell then. Otherwise sound: no sideways scroll at 390 px, "Skip to content" first in Tab order, one h1, every image has alt, and the species page's head (title, description, canonical, JSON-LD, og:image with its credit in og:image:alt) is complete.

**11. The front page's catalogue opens, on a phone, with Abelia, Abelmoschus and Abutilon, then Acacia and Acalypha.** That is the first screen of a "cactus, succulent and bulb" reference (`F-work/fv/front-phone.png`). Owner's decision. One option: open on the 173 collector genera, the rest under a chip.

**12. A non-binomial address gets "The reference has no Not". Confirmed on the live site.**
`/species/not-a-plant-zzz` reads "The reference has no Not: it is built from a fixed list of names, and none of this genus is on it." The page takes the first word as a genus. Fix: say the genus sentence only when the address has two or three words and the first is capitalisable as a genus GBIF or the index knows. Otherwise say "No species page at this address".

**13. Page behaviour hangs on free-text sentences in the dossier, and /about/formats states neither rule. Confirmed.**
The note under the name shows when `upstream['gbif.species'].detail` matches `/is cited as Kew accepts it/` (`head.ts`, `kewCitedNote`). The Habitat range line shows when `distribution.source` matches `/under the name |, reached by /`. A reworded builder sentence silently hides the note. Fix: a structured field (`name.kewCited`, `distribution.via`), or at least a line on /about/formats naming both phrases as part of the format.

**14. Smaller items.** /about/how's Wikidata lag clause ("while it lags it is asked again: the first species of a run to find it lagging waits the lag out…") becomes untrue once process change 3 lands; replace it with "a 429 or 503 is waited out and asked again". /about/how is 15,800 words and /about/formats 15,700, with single paragraphs over 2,000 words. "In brief" helps, but a grower checking one claim cannot find it.

## Open issues in my area

- **2 (Ixora coccinea):** finding 7. The root cause is the orphan test; it is a one-line fix plus a `--keys` run for one key.
- **3 (lost POWO links):** Kew's file does hold both numbers. 77238679-1 is Ceropegia macrocarpa J.N.Haage & E.Schmidt (Unplaced), another name than GBIF's "(Sprenger) Bruyns", so dropping it was right. 77320739-1 is Cochemiea matehualensis (Backeb.) M.H.J.van der Meer, a Kew synonym; GBIF's "(Backeb. ex Spine)" has no combining author, so by the rules it is another name and the drop was consistent. Recommendation: no new rule; the registers say "Kew holds this name under another author; no POWO link".
- **7 (homonym keys), facts for the owner:** 14 pages carry the note. Reading the citations (suspected, not checked at IPNI): 3 are the same name with the author spelt otherwise (Tylecodon kritzingeri "E.J.van Jaarsweld" against Kew's "van Jaarsv.", Drosera collinsiae "Brown ex Burtt Davy" against "N.E.Br.", Stapelia gettliffei "Pott-Leend." against "R.Pott"); about 5 are one plant under another citation (Weingartia steinbachii, Echinocereus sciurus, Piaranthus punctatus, Stapelia grandiflora, Crassula alpestris); about 3 are true later homonyms (Rubus parviflorus Kük., Ranunculus ficaria Walter, Myrica rubra A.Chev.). From the citations alone I found none where round 71's choice (Kew's author, names read from GBIF's usage by it) gives the wrong plant. Recommendation: keep it, but word the note by kind: where the authors agree loosely or differ only by "ex", "GBIF writes the author X; Kew writes Y; the page uses Kew's"; the present sentence for true homonyms.
- **10 (generic headlines):** finding 9: 2 pages; my recommendation is there.
- **Process change 4 (tiers, workers):** below, with a trial diff.
- **Process change 6 (smaller rounds):** the tiers make a corpus-only round cost about 16 minutes of browser time here instead of an every-engine run.

## The harness

**Cost of a strict Chromium run here** (chromium plus phone projects, 477 tests; `F-work/w2.json`, `w4.json`, analysed by `F-work/pwstats.py`):

- **2 workers:** 28.6 min, under a load average of 18.5 on 2 cores. 2 failed and 10 were flaky; 8 of the 10 were "Target crashed" or "Page crashed" under memory pressure. One of those was mine: a Python audit of mine was OOM-killed mid-run. The two failures were `smoke:688` (sync, 76 s then 112 s) and `r63v-first-screen:55` (30 s timeout).
- **4 workers:** 15.6 min, under a mean load of 7.5. 471 passed, 1 flaky (`r69x-example:117`, "Target crashed"), 0 failed.
- **Summed test time:** about 2,540 worker-seconds either way.

So 4 workers showed no flake attributable to concurrency. The machine was less loaded during that run, so the two runs are not a controlled comparison. Two cores also cannot show what 4 workers do to one wrangler dev on the PC: here the browsers and the server compete for the same two cores, while on the PC the server's single workerd thread is the shared limit. A pass here is weak evidence for the PC, and a crash here is mostly evidence about this machine's 8 GB.

**Time per spec** (4 workers): smoke.spec.ts 404 s for 119 tests; r62a-interface 157; r60-grow 152; r62ba-interface 128; r67v-example 115; r69p-disclosure 94; r70x-example 93. Everything else is under 70 s.

**Slowest twenty tests** (first attempt, 4 workers): r60-grow:184 20.4 s; r64f-firefox:75 19.6; r60-grow:220 18.7; r70x-example:178 18.5; r62a-interface:111 18.2; r64f-firefox:186 18.1; r62bg-import:64 17.7; r70x-example:51 17.5; r61g-import-labels:66 15.5; r70w-sync:15 15.2; r70x-example:79 15.1; r67v-example:112 14.4; r62g-import:72 14.1; r67h-engines:56 13.9; r67h-budget:97 13.6; r67v-example:217 13.3; phone r67h-offline:32 12.9; smoke:794 12.4; r63u-a11y:45 12.4; smoke:3421 12.1.

**What limits the worker count, with evidence:**

1. **smoke.spec.ts runs serially in one worker, and it is scheduled last.** With 4 workers, three workers had finished by 577 s. The smoke worker ran alone from 487 s to 895 s: a third of the run with one worker busy. Past 4 workers the run cannot get shorter. I tried `--fully-parallel` on smoke alone at 4 workers (`F-work/smokefp.json`): 6.9 min, 3 failed (smoke:1271, and the two clock-shifting tests smoke:3229 and smoke:3317 at the 30 s timeout) and 1 flaky (smoke:374). The same four pass alone, serially, in 1.3 min. On two cores I cannot tell contention from shared state, so I do not recommend fully parallel smoke. The safe gain is to split smoke into four files along its existing sections, each still serial. Estimated wall time at 4 workers: about 2,540 / 4 = 10.6 min instead of 15.6.
2. **One shared wrangler dev.** Round 62's 8 workers timed page loads out. The per-address windows (`RATE` in `sync.ts`: render 1,200, reference 600, match 60, searchmiss 60, index 6 per ten minutes from 127.0.0.1) are counted per ten-minute window, so a faster run puts more requests in each window. No 429 appeared in any of my runs' server output.
3. **WebKit's IndexedDB** at about one request per 16 ms (`WEBKIT_PACE`). Not measurable here; no WebKit on this machine.

**Recommendation:** 4 workers for the Chromium projects, and WebKit held to 2 per project through the per-project `workers` field (Playwright 1.63 has it). Keep 2 for the launch run, the count every deploy so far has passed at. If the PC's first `--tier=corpus` run at 4 shows any flake that its retry passes, set `PW_WORKERS=2` and send the trace.

**Redundancy:** the example collection is tested in six files (r63v-visitor, r67v-example, r69x-example, r70x-example, r64f-firefox, r67h-budget; about 420 s on Chromium). "An empty device's Today opens the example" is asserted by r63v V2 (three tests), r64f 3 and r64w 1. Each guards a different past failure; I would not delete any before the launch.

**Tiers** (trial, in the diff; `scripts/predeploy.mjs`, `playwright.config.ts`, `docs/DEPLOY.md`):

| Command | What it runs |
|---|---|
| `node scripts/predeploy.mjs --tier=corpus` | Unit tests, then strict Chromium and the Chromium phone, 4 workers |
| `--tier=app` | Unit tests, then every engine (WebKit at 2) |
| `--tier=launch` | svelte-check, unit tests, every engine at 2 workers |

Each tier stops at its first failing step with one sentence. An unknown tier, or a tier with `--browsers=`/`--project` beside it, is refused with what to type; `tests/unit/r72f-predeploy.test.ts` covers this and fails on r72base. With no tier, the script runs the browser suite as before, now on 4 workers. Steps run through `process.execPath`, so `cmd.exe` needs no `npx`.

## Checked and sound

Against the renders and the dossiers: Copiapoa calderana (Kew says Chile Central, all 73 records lie in Chile North; the page says they disagree and derives nothing); Agave wendtii's "doubtful" (GBIF's); the no-climate reasons on Adenia ovata and Ariocarpus agavioides; Rubus parviflorus's figures and range; Annona montana's "Under another author"; the redirects for Huernia zebrina, Echinopsis pachanoi and Stapelia villetiae; the front page's 5,565 of 8,947. Every shown photograph address is on the four hosts the CSP and /about/how name (apart from finding 8); other datasets' originals (bs.plantnet.org 5,668, images.ala.org.au 363) are shown from GBIF's cache (`shownAt`). Fallback fonts and the version poll match /about/how. The existing unit tests touching my changes pass (6 files, 43 tests).

## Not done

- WebKit and Firefox (not installed here).
- /about/formats read only against the dossier schema; not sentence by sentence.
- About twenty /about/how claims checked, not all.
- No screen-reader pass beyond landmarks, alt and focus order.
- Dark mode.
- The season-rule fix and the summary-proof fix are not written.
- No repeated runs to estimate flake rates.
