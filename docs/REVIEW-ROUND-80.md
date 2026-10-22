# Round eighty: the full-size reference reviewed, and what was put right

Cultifolio went live at its full size in round seventy-nine: corpus `a27e34d376199544`, 48,361 species pages. Four reviewers then used the live site on a desktop (W) and a phone (P) and audited its data (D) and its code and operations (C). Round eighty fixes what they found, and merges three branches written earlier in the round: agent N's English names from Wikidata, agent R's reasons on the pages that read no GBIF key, and agent V's most-voted wild photographs (V was already in this round's base, with agent X's fixes to round seventy-nine's build path).

The owner's PC is part way through the full plan (`scripts/corpus-plan-full.txt`) while this round is written: at step 11 of 15, the cultivated-photograph fill, about 5,176 of 48,361 pages done, run once a day. So every change below was written to be delivered between two fill days and to carry the fill on, not start it again. The plan file is unchanged, and the delivery leaves it out.

- **A**, the reference's data: ten faults in the dossiers' rules, and the repair of the live pages they change.
- **I**, iNaturalist: a fill that asks several taxa a request, the ids checked before they are used, every "not asked" with its reason.
- **S**, search and the catalogue: Kew's older names found, the true count and paging, region names, speed, "Most grown" counted again.
- **U**, the app's pages and the phone: Back, the plant page, offline pages, layout, and a smaller install.
- **O**, operations and the about pages' general sentences: the build no longer copies the corpus, the sitemap, honest caching and Cloudflare sentences, the sync race, the plan runner, GBIF's SQL.
- **N**, **R** and **V**, as above; **X**'s report is round seventy-nine's build path, already delivered.
- **M** merges them, settles their needs, writes the owner's walk and proves the merged code.

Their reports are `review-80/A.md`, `I.md`, `S.md`, `U.md`, `O.md`, `N.md`, `R.md`, `V.md` and `X.md`.

## 1. The review's findings, and what was done

| Finding | Who | Done |
|---|---|---|
| W1 "Most grown" counted over the old reference | S | counted again over the full list's 6,539 genera (6,449 counted, 2026-10-22): 118 genera, 8,278 species; `/about/how` gives the day and the genera |
| W2, P3 a search's count was its cap | S | the true count ("30 of 259 matches"), "Show more", a genus typed alone links to its row |
| W3 Xanthoceras sorbifolium with a grass's key | A | a usage GBIF files in another order than Kew's family, while GBIF's genus of that name is in Kew's order, is refused; the page is built from Kew's file |
| W4 a plant page said records "were not asked" for a keyless species that reads them | A, M | the notice says what the page read and whether the plant's key is one of its keys; the picker marks GBIF's row of such a name (M, A's need) |
| W5 range by bounding box (Nairobi in Tanzania) | A | Natural Earth's provinces (public domain) placed in TDWG's regions: 243 of 369 regions tested by shape |
| W6 a region typed gave nothing | S | answered from the build's own best hundred, or pointed to its row of the Origin grouping |
| W7, C7 slow cold searches | S | the search's reads asked at once, 30 hits a page; simulated cold searches take two fifths to two thirds less time |
| W8 the letter index wrapped | S | one line from 1,000 px |
| W9 notices over the heading; W12 two rain totals; W13 layout; P2, P4, P6, P7, P9 | U | each fixed and tested on desktop and phone |
| W10 the "your species" tiles drop a hybrid's × | not done | the tile's record id is a slug without the ×; a fix needs a migration of the device's taxon records (section 6) |
| W11 odd picker suggestions | S, U, M | a genus typed in full is matched as typed; the hint names each form's own button (M) |
| W14 a missing address took 4.4 s | S | the nearest names asked beside GBIF's name service |
| W15 the orchid 55 °F line, unsourced | the owner | not changed: section 5 |
| W16, P10 the install fetched 170 files | U | 146 requests, about 550 kB compressed where it was 900 kB |
| P1 Back ran to the end of the catalogue | U | a snapshot of the row at the top of the screen, put back on Back |
| P5 Compare offline opened the browser's error page | U | every unhandled navigation gets the app's offline page |
| P8 the app's Back after a browser Forward | U | counted by history steps |
| D1 Crocus nudiflorus took C. mazziaricus's entry | A | Kew's accepted row of the same words and author is read |
| D2 an inactive iNaturalist taxon said as "nothing to report" | I | every id checked (thirty a request) and an inactive one followed by the build's rule before a set is asked |
| D3 `/about/how` said the wild set is the open data's; most were the API's | I | such sets are read again by the rule when the fill reaches them; the page says so meanwhile |
| D4 a fifth of new pages with no taxon and no reason | I | every iNaturalist row says why; the 475 ids the full build dropped are given back (`--fill inat-restore`) |
| D5 Kew's older names not searched | S | read as a name typed, the genus first and in full, from one small file a genus |
| D6 the tomato's cold floor of 18.9 °C | A | extremes are not used when the weather cell's ground is more than 1,000 m from the typical spot's, or the record low is warmer than the coldest month's nights |
| D7 scientific names as common names | A | not shown, even a letter off, even as the only English name |
| D8 CC0 photographs naming no author | I | the observer's name, or login, as "Alan Weakley, no rights reserved (CC0)" |
| D9 a default point shared by Mexican cacti | A | 18 points read from the reference's own records, left off the map, marker and climate |
| D10 smaller inconsistencies | A, O, R | merges of the duplicate pages; keyless counts; the reasons of the pages that read no key (R); `g` pages placed by spelling still link no Kew number (section 6) |
| C1 any edit to the plan file restarts it | V, O, M | V keeps a run's place when only comments change; O keeps another plan's run apart; the delivery leaves the plan file out (M) |
| C2 the sitemap index kept a day | O | five minutes, its files named by the corpus |
| C3, C4, C5 about-page sentences untrue (hash groups, the edge's 404 and redirect, Cloudflare's NEL headers) | O | each rewritten to the code; NEL is a zone setting for the owner |
| C6 a sync race in the KV fallback | O | a receipt younger than the hold is left to its writer |

## 2. The merge

Seven branches, in the order O, I, A, S, U, N, R, each merged with its conflicts read on both sides. N and R were written on an older base (round eighty's `r80base`, without X's fixes and V), and were merged against it.

- **`scripts/build-dossiers.ts`**: S's `kew` field and A's own-name rule share the index entry (`indexNames(…, { genus, older })` with `kew`); the Kew builder's call carries A's shapes and default points, N's genera and R's reasons together; the fills' list names `inat-restore` (I) and `wikidata-names` (N) beside `kew-why` (R).
- **`vite.config.ts`**: `plugins: [corpusOnDisk(), sveltekit(), offlineFiles()]`, O's and U's, as U asked.
- **`/about/how` and `/about/formats`**: the long lines several agents changed were merged word by word and each read again. Two sentences were untrue of the merged code and are now true (M): a keyless page's definition names A's family rule ("or only under a genus it files in another order than Kew's family…, as with Xanthoceras sorbifolium"), and a plant's GBIF key "is compared with the keys the page reads GBIF's records under, and the plant's page says whether it is one of them" (A's notice), where it said "compared with no page".
- **The shared lister** (`scripts/extra-keys-list.ts`): A's merges, which give a merge a line wherever the rule gives none, now give lines only for pages of the listing, so `scripts/kew-extra-keys.ts` (keyless pages) no longer writes keyed pages' merges into `scripts/extra-keys-kew.txt`; and a keyless page that reads a merged key is not counted among those that read none (R's `noKeyFor`).
- **R's file of reasons** (`scripts/extra-keys-kew-none.txt`) was written on R's older list. Made again on the list as it now is (X's two fixes, A's Xanthoceras line): 909 reasons (643 lumped, 210 none, 46 other-type, 9 other-author, 1 other) of the 921 pages that read no key. The other 12 lost their GBIF key in X's homonym fix after `scripts/extra-keys-kew.txt` was made; the rule now finds them keys the build's download did not ask, so they say the general reason until the next refresh (named in the file's header). `scripts/extra-keys-kew.txt` is kept as the build read it.

**The needs, settled.** A to O (the plan runner keyed by plan): O's fix. A to O (keyless counts): `no-gbif.ts` gives 2,336 and 921 with Xanthoceras. A to U (GBIF's picker row): done by M. A to O and X (`scripts/default-points.txt` rewritten on the PC): new this round, so the zip's copy is the first; A's repair rewrites it on the PC and that copy stands. I to U (the photographs' sentence): "iNaturalist was left to the daily photograph fill (not asked)" where the build's rows say so (M). I to the merge (V's rule kept): kept, V's tests updated by I with comments. S to U (the picker's hint): `addLabel` on all three forms (U and M). S to U (hybrid and genus tiles): not done (section 6). U to O and S: as above. O to A (repairs only with this round's runner): the walk. N (the `--keyed` sentence, the fixture): `--keyed` stays off, so the sentence stands; no fixture conflict arose. R to X: X put both findings right before the build. R (one plan with N's and V's): not made; during this fill the one-off fills are typed alone (section 3), and R's and N's plans stay for a finished corpus. V (no step line changed, `sameSteps` kept, V's clause word for word): kept.

## 3. The owner's walk

`docs/DEPLOY.md`, "Round eighty: the owner's walk", is the whole of it; the agents' sections after it are reference. In short, never while `corpus-step` runs:

- **(a) The delivery and the deploy**, one evening: extract the zip (every file changed since the last delivery, `24918e4`, 199 files, the plan file left out); delete the nine app files that moved to `static/app/`; `--status` (lines 1 to 10 done, 11 unfinished); `predeploy --tier=app`, whose browser suite now starts in about 20 s; `corpus-ready && npm run deploy`.
- **(b) The one-off steps** between two fill days, about two hours: I's `--fill inat-restore backups\v3-<id>` (under a minute), N's `--fill wikidata-names` (seconds of queries, then the index), R's `--fill kew-why` (seconds, then the index), and A's Wikidata retry (`--list-wikidata-retry`, then `--keys rebuild-wd-retry.txt … --skip inat`, about an hour and a half with the download).
- **(c) The daily fill** until it ends, about five more days at about three hours a day; the last run goes on to `--index` and stops at step 13's review.
- **(d) At that review stop**, before the upload: A's repair by hand (three listings, three `--keys` runs, `--prune-followed`; three to five hours), then `--index`, then `--go-on` for the upload and the live check. A said "before the plan's own `--index`" and O "a repair plan only after the full plan finishes": the review stop is after the plan's `--index` and before its upload, so typing the repair there, then an `--index` of its own, carries both the fill and the repair up in one upload, without a second plan's upload.
- **(e)** the `s/v2` purge on or after 26 October; the prune a day after (d)'s upload.

If the zip is extracted on the evening of 23 October: fill days 24 to 28 October, the repair and upload on 28 or 29 October, the prune from 30 October.

## 4. What was proved

- **The order of operations, on a simulation of the PC.** The PC's code (`24918e4`) and plan file, a 24-page corpus of round seventy-seven's real pages rekeyed, `corpus-step.json` at step 11 (1 to 10 done, the fill unfinished at the allowance), and two pages whose iNaturalist ids only the backup held. This round's files were extracted over it as the zip will be (the plan file left out) and the nine moved files deleted, and `scripts/corpus-step.mjs` was run for real: `--status` showed step 11 unfinished; `--fill inat-restore` gave the two ids back; the daily command at an allowance of 3 carried on at step 11 with I's code (no backup, no build), checked the 18 unchecked ids and stopped at the allowance (exit 3); the next run finished the fill in 2 batched searches for 15 sets and 1 alone, read Kew's descendants, ran step 12's `--index` and stopped at step 13's review (exit 2); A's offline lines, `--prune-followed` and `--index` ran at the stop; `--go-on`, its rclone and live check stubbed, ran steps 14 and 15 and ended "every step is done". The same corpus with this round's plan file too carried on at step 11 (V's `sameSteps`); the PC's code given this round's plan file started again at step 1, the reason the zip leaves it out. iNaturalist was asked live, one request every 2 s: 14 requests in all.
- **The unit suite, alone, on the merged head**: 491 files and 4,458 tests passed, 1 file and 10 tests skipped, in 473 s. `tsc --noEmit -p .` and `svelte-check --threshold error`: no errors.
- **The browser suite, strict, Chromium and its phone, four workers**: 587 passed, 5 skipped, in 13.4 minutes. Its server (build, fresh state, `wrangler dev`) answered in 21.4 s; with round seventy-seven's real corpus on disk (25,860 files), 20.5 s, its output 173 files, 3.0 MB: the build no longer copies the corpus.
- **A dry run on the real corpus** (round seventy-seven's 8,947 pages, rekeyed to version 3), of what runs offline: `--fill inat-restore` gave back 475 of 475 ids taken out as the full build took them (9 s); `--fill kew-why` changed nothing (no keyless page there); `--list-default-points` 18 points on 593 pages; `--list-range-shapes` 2,300 pages; `--list-wikidata-retry` none; `--prune-followed` none yet (the kept pages not rebuilt); the fill at an allowance of 0 counted its work and asked nothing (7,520 ids to check, about 251 requests; 1,077 pages without a taxon). The index of the merged code against the base's, over the same dossiers: 1,834 entries gain Kew's older names (15,331 names), 5 lose a scientific name from their list of common names, kept only for the search (Podocarpus costalis, Aloe vera, Aquilaria sinensis, Ebenopsis ebano's "Pithecellobium flexicaule"), and Ceropegia cereiformis takes its merged-away id `g9574874`; 1,691 more search key files, 2.0 MB.

## 5. The decision left to the owner: the orchid 55 °F line

`src/lib/core/arch.ts` holds one figure for each of four care groups: tropical foliage plant 12 °C, orchid 13 °C (55 °F), epiphyte 10 °C, fern or moss 5 °C. An orchid page says "the convention for orchids grown indoors is 55 °F; no source is given for it", and `/about/how` calls it "the author's statement of a growers' convention". It never raises or replaces a cold floor read from the climate. It is honest, but it is a figure without a source (rule 1). The options (agent U's):

1. **Keep it as it is**: the page says plainly that it is unsourced.
2. **Remove the four figures**: the care group and its reason stay, with no number (`arch.ts`, the sheet's sentence, the `/about/how` paragraph).
3. **Source them**: one published growers' reference for each figure, cited on the page; the figures may change to match it.
4. **Move them under "How this section is made"**, out of the sheet itself.

Standing offers, decided before or not urgent: Wikidata names for keyed pages without an English name (`--keyed`, off; N measured 69 pages that would show one, 29 of them "Pitcher plant"); a lumped keyless page reading its own-type names' records (R measured 509 pages; kept as it is on 2026-10-20); iNaturalist's name search by older names (I; up to five requests a keyless page); Cloudflare's network error logging (O; a dashboard toggle); R's two letters to GRSciColl and Index Herbariorum asking for a licence.

## 6. Not done, with why

- **The hybrid tiles of "your species"** (W10, S's need to U): the device's taxon records are keyed by a slug without the ×, so Aloe × nobilis shows as "Aloe nobilis" and a reference hybrid is not found. The fix changes the device database's keys and needs a migration; it is next round's, with the genus-level tile S asked for.
- **`g` pages placed by Kew by spelling still link no Kew number** (D10's last part): not in this round's list.
- **126 of TDWG's regions** keep their bounding box: their provinces could not all be placed (A).
- **The 12 keyless pages whose keys the download did not ask** say the general reason until the next refresh of `scripts/extra-keys-kew.txt` and the download (M).
- **WebKit and Firefox** were not run here; the owner's `--tier=app` runs them.
