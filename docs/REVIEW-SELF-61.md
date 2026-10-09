# Self-review of `f4ab4f8`: round sixty-one

Nine reviews ran in parallel on 2026-10-07 against a written brief. Each worked in its own copy and against one shared local server with the fixture corpus. The serious findings were checked again by hand, and every reproduction test the reviewers wrote was run on a clean copy of `f4ab4f8`. Their reports and tests are in `docs/review-61/`:

| Report | Area |
|---|---|
| `clock.md` | the clock rule and the fold |
| `records.md` | numbers, dates, names, backups and the import |
| `server.md` | sync, counters, the cap, the engine's answers |
| `corpus.md` | search and common names |
| `harness.md` | mutation testing and the suites |
| `grower.md` | a collector moving a 300-line sheet in |
| `a11y-perf.md` | accessibility and performance |
| `visitor-words.md` | everything a first-time visitor reads, and the about pages |
| `triage.md` | the round's claims against its triage, and the seams |

**Verification.** On a clean copy, the 40 unit test files gave 158 tests:

- 94 pass: the guards, and the reviewers' own checks;
- 64 fail, every one an assertion and none an error: the reproductions, as their headers say.

The five e2e specs gave 17 tests: 15 reproductions fail as designed, and 2 guards pass. These findings were also confirmed by hand on the shared server:

- `/api/names?q=Copiapoa cinerea KK 1234` answers 400;
- `/api/search?q="Copiapoa cinerea"` answers no hits;
- the picker lower-cases the name it sends;
- the import keeps its own copy of the old year rule;
- the backup exports the in-memory parked set.

**The headline.** Round sixty-one's own changes mostly hold:

- **The clock:** the convergence fuzz still converges on 120 of 120 skewed seeds, even with a faithful monotonic clock.
- **Postings:** they equal the whole index on every new search path (about 1,400 answers, 0 mismatches).
- **Record pages and storage:** the keyed record pages, the sample's storage scopes, the calendar file and the label print geometry are sound.
- **Tests:** 50 of 65 mutations of the round's fixes are caught.

What breaks is at four places:

- **The import's promises:** restartable, lossless, and numbered as reviewed.
- **Rule 2 on Today:** when the species sheets do not answer, Today lists resting plants as due and says nothing. This is older than the round.
- **New search shapes the round's rules opened:** a quoted name now finds nothing.
- **The seams around the new clock rule:** the engine and the backup read the clock's in-memory parks as stored verdicts.

## P0: before launch

1. **Today says nothing when the species sheets do not answer, and lists resting plants as due.**
   - `src/routes/today/+page.svelte:94, 102-111`: a failed `sheetsFor` leaves `sheets` null, so `restRule` returns null for every plant.
   - Online, five Copiapoa cinerea in their habitat's rest are listed apart. With `/api/sheets` refused, the same five move into "Past their rhythm" with a Water button, and the page has no "not checked" anywhere.
   - With 300 plants, the Greenhouse stop read "Water 75 here" online and "Water 100 here" refused.
   - Rule 2, on the page a grower opens every day. Grower 1, a11y 2; predates the round.

## P1: the first weeks

**The import.**

2. **A second run files the same plants again** unless every line carried its own number and kept its name.
   - `plan.ts` `markAlreadyImported` matches only (number given, same name and cultivar). A sheet with no number column, a line the first run renumbered, or a line fixed with "Use it" is filed twice.
   - The grower's 300-line sheet added 28 lines (42 plants) again on the second run.
   - `/about/formats` says "running it again skips them". Records 1, grower 3.
3. **The numbers given are not the numbers the review showed.**
   - `plan.ts` numbers rows in sheet order, but `commit.ts` writes rows with their own numbers first and lets the collection mint the extra plants of a Qty row. An earlier unnumbered row is then pushed to the next free number.
   - The done screen says those numbers "were taken", when this import took them.
   - `/about/formats` says "The numbers shown in the review are the numbers given". The existing test compares sorted sets, so it cannot see this. Grower 2.
4. **"Use it" throws away what the sheet said beyond the species.**
   - It replaces the whole name with the suggestion: "Copiapoa cf. cinera" is filed as "Copiapoa cinerea" with its key.
   - A subspecies and a bracketed note are lost too, and `nameAsReceived` is left empty. Records 2.
5. **The date choice, the notes box and the column mapping stay live after "Check names", and are ignored.** The page shows "Month first" while the plant is filed day first. Records 6, grower 5.

**Search and names.**

6. **A whole name in quotes finds nothing.**
   - `search.ts:86, 100`: a capitalised quoted text is dropped as a cultivar, so `"Aloe vera"` leaves no word, the retry drops it too, and the front page says nothing in the reference matches.
   - This is new this round, and it breaks rule 2. Corpus 1.
7. **The species picker says "The name service did not answer" when this site refused the name.**
   - `/api/names` answers 400 to any query with a digit, so every field number ("Copiapoa cinerea KK 1234", "Lithops lesliei C036") gets it. The route's own rate-limit 429 does too.
   - Rule 2, on the add form. Server 1.

**The interface.**

8. **"Select these" on a place page does not open select mode when tapped.**
   - `SelectMode` reads `start` once in its own `onMount`, before the page sets it. Only a full page load works, and that is the only case the tests cover. Grower 4.
9. **Select mode hides the focused tick box.**
   - The focus helper never counts the select bar, which floats 8 px above the tab bar (`focus.ts:70`).
   - At 200% text, the sticky layers cover 682 to 753 of 700 px.
   - At 390×844 and 100% text, 3 of 12 focused boxes were fully hidden; at 200%, 8 of 12. WCAG 2.4.11. A11y 1.

**The clock.**

10. **The engine reads the clock's in-memory parks as stored verdicts.**
    - `engine.svelte.ts:419, 866, 934`: `judgeOwn` skips stamps the confirmed clock parked in memory. So a writer that merged a far change from a backup never stores the arrival park its peers store; three days later the writer shows it and every peer keeps it parked.
    - `takeBatch` can also store a clock-only park as an arrival verdict (rule 5).
    - Reproduced through the real engine. Clock 1.

## P2: worth fixing

**The clock and rule 5.**

- **The backup carries the clock's in-memory parks.** It writes them into the manifest, and a restore stores them for good (rule 5). Clock 2, records 7.
- **A plant made while the clock was fast, then edited after it was put right, is "waiting for a field from a newer version".** Its creation is parked by arrival and the marked edit is not, so it folds without a name. Clock 3.
- **A laptop sleep drops the correction** where `performance.now()` stops during sleep. A fast device's first edits after waking are then parked everywhere. Clock 4.
- **A correction for a clock more than five minutes slow lapses although nothing moved.** The log is refolded again and again, and the snapshot is never read. Clock 5.
- **A marked far edit outranks edits and removals made later elsewhere,** for as long as the fast stamp is ahead. A plant removed an hour later comes back. This is the price of the mark, and it is not stated anywhere. Clock 6.
- **"Renumber now" past a marked far stamp writes a repair that is itself parked,** dated a year ahead. Clock 7.
- **An older build's stored park of a marked stamp survives its update.** Clock 8.
- **A far change of this device's own, parked after a lost push answer, stays on screen in this tab until a reload.** Clock 9.

**The import.**

- **Doubt markers.** "nr." and "cfr." are dropped without a word, and the plant is filed as the species. Records 3.
- **Unread Status and Kind.** A Status or Kind the import cannot read is said on the row, then lost: a sold plant arrives as growing. Records 4.
- **Sheets over 2,000 lines.** A sheet of more than 2,000 lines can never be finished, since the same first 2,000 are read and skipped each time. Records 5.
- **Paths.** Real sheets write "Greenhouse > Bench 2". Splitting only on " › ", as decided, makes it a flat top-level place, out from under the Greenhouse's dry months, so the calendar waters it in winter. Grower 6.
- **Provisional names.** "Copiapoa sp. 'Pan de Azúcar'" is filed as a hybrid. Grower 7.
- **The year rule's copy.** The import keeps its own copy of the old year rule (`commit.ts` `mintYear`), so year-only rows of several plants are written one plant at a time, against "each line is its own change". Triage 2, records 10.
- **Spending.** £ and GBP, and € and EUR, are totalled apart. "US$15", "R85" and "£1,250" are not read. A Qty row's price is counted once per plant. Grower 8.
- **"Name not checked".** A plant page says this for a name the reference answered and did not hold (rule 2 the other way round). Grower 9.
- **Moving a filtered list.** A Move that empties a place-filtered list closes select mode and drops focus. Grower 10.

**Search.**

- **Case in the picker.** The picker lower-cases the name before searching, so the author rule never applies there. A name pasted as POWO prints it gets no suggestion. Corpus 2.
- **Picked names.** `pickedName` writes a half-typed rank or an author into the plant's name ("Copiapoa cinerea var"). Corpus 3.
- **Hybrids.** A hybrid with an abbreviated second parent ("Aloe vera x G. batesiana") is still answered as one parent, unlabelled. Corpus 4.
- **Common names with "St.".** "St." cuts a common name ("Lily of St. James"). Corpus 5.
- **Label qualifiers.** "Copiapoa cf. cinerea" finds nothing, and "Aloe sp." answers Aloe speciosa unlabelled. Corpus 6.
- **The common-name rule on `/about/how`.** Its preferred and source-count steps have no data in the live corpus: the stored names predate them. GBIF's list is also cut at 50 rows across every language. Corpus 7.

**The server.**

- **Pre-round-58 vaults.** One whose place is reclaimed takes it back uncounted, every time. Server 2.
- **The old-name check.** The species 404's check is outside the per-address part, so one address takes a fifth of GBIF's share, not a tenth. Server 3.
- **Joining.** A join answered with a crossed recount shows "It tries again shortly", and nothing tries again. Agent S asked for this at the merge, and it was not applied. Triage 1, server 9.

**Words.**

- **Wrong sentences on `/about/formats`:**
  - it says a stamp's counter has six digits only past 65,535 changes in a millisecond, but every marked edit has six;
  - it says a change not yet sent is held, but this device's own changes are neither held nor parked.

  Visitor-words 1 and 2, clock 11.
- **"Warmest month, mean day".** It is the mean daily high. Nothing on the site defines "mean day". Visitor-words 3.
- **The printed label line.** It still calls the cold floor "hab. night" and the light "sky". Visitor-words 4.
- **The common names `/about/how` promises.** It says every other English name is listed. The page shows four. Two of the stated tie-breaks can never decide. Visitor-words 5, triage 8.
- **The photo rule.** It reads "2026" or "2026-04" as its first day, so a plant imported last week counts as six months old (rule 3). Visitor-words 6, records 9.
- **The restore rule.** `/about/formats` still states the one the round replaced. Records 8.

**Accessibility.**

- **The Archive toast.** After Archive at 320 to 375 px, the Undo toast covers the button focus was moved to. A11y 3.
- **A returning grower's front page.** At 1280 it shifts 0.14 to 0.20 after painting the visitor's page. A11y 4.
- **"Show N more".** Today's button drops focus to the page body. A11y 5.

**The harness.**

- **Surviving mutations.** 12 of the round's fixes can be reverted with every unit test green. A killing test is written for each. Harness 1.
- **The snapshot race.** Three e2e helpers still race the page's first snapshot, and the round's own fix in r61a is a pause, not a wait. Harness 2.
- **The bundle guard.** It never guards a deploy: `npm run deploy` tests before it builds, and the test skips a stale build. Harness 3.
- **Timeouts and flakes.** Smoke 3018 times out on most loaded runs, and smoke 2781 is a real flake. Harness 4.

## P3

About 70 smaller items across the reports. Among them:

- **The clock:**
  - the fuzz's monotonic clock is the real one, so it barely tests a correction in force;
  - the fold-rules hash's stated scope;
  - a peer that marks every stamp escapes parking;
  - a photo removal under a marked far stamp waits a year;
  - a counter can reach the mark by following a peer's 0x7fffff.
- **Records:**
  - after a Replace, "reached this device while removed" is judged by stamps again;
  - the plant page's date field shows a partial date as empty;
  - "sp." names on the review, plant page, notes heading and stranger's label;
  - "1/1/27" read as 1927;
  - date-time cells;
  - Qty "3.0".
- **The server:**
  - the lapsed-lease landing is not generation-bumped;
  - a refusal outlives its hour after the clock goes back;
  - a place page's held forecast is never asked again;
  - the picker blames the site for an address's part;
  - the residual race is two calls, not one;
  - "at most hourly" holds only per tab;
  - the 90-day clock needs the vaults object awake.
- **Search:**
  - case-only spellings are merged before the rule;
  - one source with three spellings counts three times;
  - homonym genus words set back the grower's own name ("Amaryllis", "Autumn crocus", "Red yucca");
  - ʻokina-initial names stay lower case;
  - a trailing full stop;
  - "E. 'Perle…'";
  - the picker is silent when the reference search fails;
  - the audit script's argument order.
- **Words:**
  - "172" genera (173);
  - "two public answers" (three);
  - "One care line say";
  - "Chosen by rule" with no rule stated;
  - the share card's band and its silent missing floor;
  - the 404's "not checked" for a held call;
  - compare silently drops a fourth species;
  - the fixture's 31 + 6 = 40 and mismatched credits;
  - the README's `SYNC_OPEN` and its map of the review files;
  - the offline page;
  - the phone search placeholder.
- **Accessibility:**
  - label in name on the plant page's photo grid and the species photo strip;
  - a repeated toast sentence is silent;
  - the select bar floats 72 px up on a desktop;
  - the hold cap moves focus;
  - `/plants` still loads the backup module;
  - the Linux font swap (open from 60).
- **The grower:**
  - a removed plant's label drops the cultivar;
  - zero-width and line-separator characters on a stranger's label;
  - "Every 1 days";
  - the frost line in the sample points to locked Settings;
  - labels forget the plants picked;
  - Excel's "Aug-17" and serial dates.
- **The seams and cleanup:**
  - Today and the list read the photo rule by two clocks;
  - "the sample was closed in another tab" is handled twice, and the copies disagree;
  - the seam test does not check which storage a key is in;
  - the round's account claims more than its logs show (see below);
  - dead code: the grow barrel `grow/index.ts`, `clearSampleSettings`, duplicated cap constants, `upstreamAllowed`;
  - four comments say parking is "a day" past arrival;
  - `dbg-proxy.mjs` in the repository root;
  - round sixty's merge leftovers, untouched.

## Corrections to the round's own account

`docs/REVIEW-ROUND-61.md` says more than the logs show (triage 6):

- **"Each agent showed its new tests failing on the base first."** Not every agent did. Several adopted guards pass on the base by design, and some e2e tests were not run against a base build.
- **"Two earlier full runs found five failures and three flaky tests."** The logs show four and two.
- **"All 179 passing on the last full run."** That run predates the last test edit and section 12's changes. A spot run after them passed, but not the full suite.
- **"Fixed waits before negative assertions wait for the operation instead."** Four were changed, eight short pauses remain, and two new CLS tests add fixed waits.

## Checked and sound

- **The clock.** The rule converges:
  - 120 of 120 skewed fuzz seeds, also with a faithful monotonic clock;
  - the mark survives the backup zip, the CSV and the importer;
  - a natural counter cannot reach the mark by ticking;
  - per-change arrival judging never parks a true-time edit;
  - Apply on a parked restore restores.
- **The records:**
  - the keyed record pages keep scroll on Back, an upload in progress and Undo;
  - a partial date survives the edit form and every reader but the photo rule;
  - `plants.csv` comes back unchanged through LibreOffice;
  - the date reader refuses the attack list correctly;
  - 10,000 rows read in linear time.
- **The server:**
  - photo removal by claims alone, the proof checked first, the fence and the recount check held under every interleaving built;
  - the refusal and the 409 behave as stated within a tab;
  - every route carries its security headers.
- **Search:**
  - postings equal the whole index on every new path;
  - the round's fixed shapes all answer right;
  - search charging is summed and charged once;
  - the page and the tile agree on common names.
- **The words:**
  - the four figure labels on every surface;
  - ties, hemispheres and the CHELSA caption;
  - refused and pending species everywhere;
  - the hero credit on a phone;
  - every storage key and host on `/about/how`, in both directions;
  - all 69 internal links.
- **Accessibility and performance:**
  - the toast no longer traps Tab, and its cap measured 29.8 s;
  - every new action keeps focus on a named control in the keyboard flows;
  - forced colours, reflow and 400% zoom fixed;
  - Today's layout shift 0 at 300 and 3,000 plants, with 2,010 elements (from 18,200);
  - the sample's first entry shifts 0.041 (from 0.43);
  - about 25 KB gzip less JavaScript on every page.
- **The grower:**
  - columns, Qty, dates at their precision, the cf. names and the leave guard work on a real-shaped 300-line sheet;
  - labels print at the stock's pitch on A4 and Letter, and every QR code decodes;
  - the sample leaks nothing into the grower's settings;
  - the calendar validates (CRLF, 75 octets, one VALARM per event, no watering in a dry month across two years).
- **The year.** The unit suite passes in 2027, across New Year's midnight, and at UTC+14 and UTC−11.

## To run on the live site

The live site is not reachable from the review sandbox. `docs/review-61/corpus.md`, "What to run on the live site", gives 14 commands with the result that confirms each finding. Among them:

- the quoted name;
- hybrids with an abbreviated parent;
- qualifiers;
- homonym set-backs;
- page against tile;
- how often a GBIF-preferred name differs from the shown one;
- truncation at 50 names.
