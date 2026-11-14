# Round 90: each day's run uses both fills' allowances

The owner asked, on 13 November 2026, that the daily plan (`scripts/corpus-plan-r87-daily.txt`) stop wasting BHL's
allowance. Before this round its steps ran one after another: `--fill flowering` stopped each day at iNaturalist's 4,000
requests (exit 3), the run stopped with it, and `--fill bhl` was reached only once flowering had read every page, about
eleven days on. BHL's own 4,000 requests a day went unused all that time unless `npm run dossier -- --fill bhl` was typed
by hand after each run.

## The change

`scripts/corpus-step.mjs` reads a new plan line, `daily dossier <a fill>`: one of the day's fills, each under a daily
allowance of its own.

- A daily step that stops unfinished (its day's allowance spent, or a source that did not answer) is recorded
  `unfinished`, says so, and the run goes on to the next step: "Going on to the next of the day's fills."
- Before the first step after the daily steps (here `dossier --index`), and at the plan's end, the run stops while any of
  them is unfinished (exit 3), naming each and why. When every one has spent its allowance: "Run the same command again
  tomorrow, after midnight UTC". When a source did not answer: "in an hour or so" (a fill whose allowance is spent stops
  at once on the next run, asking nothing).
- A daily step that fails, or stops for review, stops the run at once, as any step does.
- A daily step that has finished is recorded `done` and passed by on later days, so the run asks only the fill that is left.
- A step without `daily` behaves exactly as before.

`scripts/corpus-plan-r87-daily.txt` marks both fills `daily`. Its step lines changed, so the next run of it starts its
record again at step 1 (the record of today's run is renamed aside, as any changed plan's is); nothing is lost, since each
fill asks only what is left.

Tests: `tests/unit/r90a-daily-fills.test.ts` (the plan line, the gate, the sentence, the runner day by day on the fills'
own last lines, and the plan file); `tests/unit/r87s2-integration.test.ts` reads the plan's new lines.
`docs/STAGE2-OWNER-87.md` no longer tells the owner to type `--fill bhl` by hand.

## The proof checks the stamps before it builds

The proof's first run stopped an hour in (the record, below): each build writes the index at its end, the index stamps
every page changed since its last stamp, and the flowering fill had left 2,769 such pages outside the sample, which the
proof cannot put back. `scripts/dev/r88-prove.mjs` now checks this before it builds, with the builder's own `restamp`
and hash: a page outside the sample whose stamp no longer holds stops it at once (exit 2), naming the pages and saying
to write the index first (`npm run dossier -- --index`), and nothing is built.

Test: `tests/unit/r90b-prove-stamps.test.ts` (on the twelve pages of round 88's proof test, a page outside the sample
changed as a fill changes it: refused at once; with every stamp holding, the proof runs as before).

## Leads for gathering faster, and only when needed (not done; each to be measured before it is built)

These came up while reading the fills. None is in this round's code. Each would follow round 88's rule: a lead is
proved by the pages it writes matching the pages the slow way writes, or it is dropped.

1. **Flowering from the GBIF download already on disk.** iNaturalist's research-grade observations reach GBIF with their
   phenology annotation in Darwin Core's `reproductiveCondition`. Checked on 13 November 2026: the download in `bulk/`
   (GBIF 0038605-260928105237408, doi 10.15468/dl.hbdw64, made 21 October 2026, a full Darwin Core Archive) has the
   column (32 of 180), and in its first 2,000,000 rows, 1,753,524 are iNaturalist's (dataset 50c9509d-…) and 281,285
   of those fill it: "flowers" 140,489, "fruits or seeds" 43,191, "no flowers or fruits" 41,520, "flowers|flower buds"
   28,700, "flower buds" 13,128, and mixes. So flowering by month could be read offline for every page in one pass
   over the file, instead of 44,000 iNaturalist requests over eleven days. Before it is built: which of these values
   the live fill's "Flowering" annotation counts (iNaturalist's "Flowers and Fruits" term; "flower buds" is a question),
   and a compare against the 2,785 pages the API read on 13 November, page by page and month by month. The page would credit the GBIF download (its DOI and day)
   rather than iNaturalist's API on a day, and the counts would be the download's, not live ones: a compare on a sample of
   pages decides whether that is close enough to say as the same figure.
   **Measured on 14 November 2026** (a script outside the repo, reading only): one pass over the download's
   `occurrence.txt` took 14 minutes: 146,433,123 rows, 38,983,204 of them iNaturalist's, 6,250,237 with a condition
   ("flowers" 3,118,650, "flowers|flower buds" 640,410, "flowers|fruits or seeds" 217,165, …), over 40,541 GBIF species.
   Rows counted as flowering: those whose condition includes "flowers" (iNaturalist's value 13), by `month`, under the
   page's GBIF key. Against the 6,785 pages the API had read (13 and 14 November): 123 have no GBIF key and 679 have no
   iNaturalist row under it in the download. Of the rest, 1,662 none in both; 11 none from the API and some in the
   download; 366 some from the API and none in the download (median 2, but a tenth over 1,969: the API's taxon and
   GBIF's key are not the same plant there); 4,623 some in both. On those 4,623: the download counts 0.79 of the API's
   (quartiles 0.67 and 0.94: it holds only openly licensed observations, as of 21 October); the shape agrees (cosine
   median 0.994); the peak month is the same on 84.3% and within a month on 92.1%; but the months holding a tenth of the
   year's count are the same on only 63.5% (on pages of 30 or more, 69.9%). The farthest apart are taxon mismatches
   (Melaleuca citrina: the API's peak October, the download's January; Monardella odoratissima: the download twice the
   API's).

   **So not the same figure, and not a replacement for the fill.** A page's flowering months would move on a third of
   pages, and some pages would take another plant's observations. The fill has about ten days left and is the figure
   the pages say. What the download could still give, each a decision for the owner and each sourced as the download
   (doi 10.15468/dl.hbdw64, 21 October 2026), never as iNaturalist's API: flowering for pages with no iNaturalist taxon
   (the fill cannot ask them; only where the GBIF key is the page's own), and a refresh check later (lead 4). Not built.
2. **BHL links from IPNI.** IPNI records carry a BHL page link for many names. Where Kew's citation and IPNI's record are
   the same publication, IPNI's link would save the resolver request. Measure how many of the 39,963 askable citations
   IPNI already links, and whether those links agree with what the resolver answers on a sample.
3. **BHL's bulk data.** BHL publishes its titles, items and pages as downloadable files. Matching volume, page and year
   offline is easy; matching Kew's abbreviated titles to BHL's titles is the hard part the resolver does. Worth a dry
   comparison only if (2) leaves many citations.
4. **Refresh only what changed.** Once the fills have finished, a later refresh need not ask all 44,000 pages again:
   iNaturalist's species counts answer for hundreds of taxa a request, with each taxon's observation count. Asking again
   only the pages whose count changed since the day recorded would turn a refresh of eleven days into about a day.
5. **The speed round's proof.** Run and passed on 14 November 2026 (the record, below): builds of eight pages at once
   with the bulk cache are the same as one at a time without it, on 200 real pages. Builder steps may now run at round
   88's speed.

## The record

- 13 November 2026, 20:55 to 22:29 UTC: the daily plan's first day, on d433142's runner (before this change).
  `--fill flowering`: "2785 pages asked of iNaturalist on 2026-11-13: 2785 read (846 with no flowering observation of a
  wild plant), 0 not answered; … stopped: api.inaturalist.org: today's allowance of 4000 requests is spent …; 43830 left
  to ask". The run stopped there (exit 3), and BHL was not asked: the case this round closes. 2,785 pages is under the
  4,000 because the allowance is iNaturalist's day for every fill, counted across the day's runs.
- `tests/unit/r90a-daily-fills.test.ts` on d433142's `scripts/corpus-step.mjs`: FAILED ("corpus plan line 17: "daily
  dossier --fill flowering" is not a step this script knows").
- On this round's code: r90a (12 tests), r87s2-integration and r89b-review-checks: 29 passed.
- The predeploy (`node scripts/predeploy.mjs --tier=corpus`), 13 November 2026, ended 22:48 UTC: unit tests 684 files,
  6,201 passed and 10 skipped; the browser suite in Chromium desktop and phone, 1,019 passed and 7 skipped: "every test
  passed first time in Chromium (desktop and phone)", stamped. A first run, started from Git Bash, failed 27 tests in 12
  files that read zips: on Windows the bulk readers run the `tar` first on the PATH, which in Git Bash is GNU tar (it
  cannot read a zip) and in CMD and PowerShell is Windows' bsdtar. Not this round's code; run the predeploy from CMD or
  PowerShell, as the owner does.
- The round 88 proof (`node scripts/dev/r88-prove.mjs`), first run 22:48 to 23:49 UTC: build A (200 pages, one at a
  time) finished and its pages were put back; the proof then stopped, before build B, on its check of pages outside the
  sample: 2,769 dossiers rewritten at 23:46 UTC, none in the sample. They are the pages `--fill flowering` wrote that
  evening. A build writes the index at its end, and the index stamps `changed` on every page whose content no longer
  matches its stamp (`scanDossiers`, build-dossiers.ts), as the daily plan's own `--index` would have; the pages hold
  `"changed": {"on": "2026-11-13", …}` and their flowering as the fill wrote it. Nothing to restore. So the proof stops
  whenever pages were filled after the last index: run it with the index current (a follow-up: have it say so before
  it builds, rather than after an hour). Second run, 13 November 23:52 to 14 November 02:12 UTC, the stamps now current:
  passed. `r88-prove/result.txt`: "A and B (eight at once against one at a time): the same, 200 of 200 pages"; "B and C
  (the cache read against the files read): the same, 200 of 200 pages"; minutes A 68, B 60, C 10; "the corpus is as it
  was (the 200 pages and the files kept put back)". So rounds 88 and 89 hold on real pages, and builder steps no longer
  need `--pages 1 --no-bulk-cache --no-api-answers` (no plan in `scripts/` carries them).
- 14 November 2026, 02:28 to 06:51 UTC: the daily plan's first day on this round's runner. `daily dossier --fill
  flowering`: "4000 pages asked of iNaturalist on 2026-11-14: 4000 read (871 with no flowering observation of a wild
  plant), 0 not answered; 2785 read before and passed by; … 39830 left to ask", then "Going on to the next of the day's
  fills." `daily dossier --fill bhl` (from 04:59): "4000 citations asked of BHL on 2026-11-14: 915 linked to the one
  page BHL gives for them, 3082 with no page taken (said why), 3 not answered; … 880 not in a form BHL can be asked
  exactly". Then "Stopped before "dossier --index": the day's fills are not finished, and each has spent its day's
  allowance … Run the same command again tomorrow, after midnight UTC". Both allowances used, as this round meant.
  iNaturalist answered 429 often near the end of its 4,000 (a 60 s wait each), so its share took about two and a half
  hours.
- `tests/unit/r90b-prove-stamps.test.ts` on bf1a176's `scripts/dev/r88-prove.mjs`: FAILED ("expected 1 to be 2": A was
  built, then the proof stopped on the page outside the sample). On this code, with r88s-prove: 4 passed.
- The predeploy (`node scripts/predeploy.mjs --tier=corpus`, from PowerShell) on this change, 14 November 2026, ended
  07:07 UTC: unit tests 685 files, 6,203 passed and 10 skipped; the browser suite in Chromium desktop and phone, 1,019
  passed: "every test passed first time in Chromium (desktop and phone)", stamped.
