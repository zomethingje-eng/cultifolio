# Round 110: the species list grows each day, by a stated rule (plan)

The owner's request of 22 November 2026: "the ability to run something that adds the next 1,000-4,000 species and can
fill in more species each day", within the sources' allowances. Planned against the code on 22 November 2026, while
round 109's photograph copy held the lock (so the measures below are taken in the gap after it).

## What the list is now

scripts/species-list.txt, written by scripts/select-species.ts on 19 October 2026 (/about/how#list):
- every species Kew accepts with at least three cultivated records (iNaturalist's observations marked captive or
  cultivated, plus GBIF's living-specimen records of the datasets the dataset rule counts);
- every accepted species of the 173 collector genera;
- every species already in the reference.

48,375 pages. The counts it read were kept in bulk/select/, which is no longer on disk. A run asks again: about 120
requests to iNaturalist (one every two seconds) and about 740 to GBIF (one a second), about 20 minutes.

## The rule for what comes next (decided)

**The queue is every species Kew accepts with a cultivated record, counted as the list counts them, that the list does
not hold.** It is ranked:
1. its records, more first;
2. then its iNaturalist observations (a grower's plant before a garden's accession, at the same total);
3. then Kew's name, A to Z.

Its head is the species whose records reached the list's bar of three after the list was made, then those with two,
then one.

Why this rule and not another:
- It is the list's own counts carried on, so /about/how says one rule, not a second kind of choice.
- It reads only counts the list already reads, under the same matching rules and the same refusals.
- Ranked, "the next 1,000" is always the same species for the same counts, and the list's line says each one's counts
  and the day it joined.
- The list stays as made on 19 October 2026. A first try wrote it again from fresh counts. That changed the
  figures round 79's tests and /about/how hold (26 species by the reference alone became 72, and every line's counts
  moved). select-species.ts --queue-only writes the queue against the list as it stands, and the species that have
  since reached three records lead the queue instead.

Not taken: GBIF's total records per species (another 15,000 or so requests for a tie-break), or genera already held
(a choice of taste, not a count).

## How a species joins (decided)

**A queue, taken from each day.** select-species.ts writes the ranked queue (scripts/species-queue.txt, the list's
format and columns plus its rank) beside the list. `--grow N`, a builder step that asks nothing:
- takes the next N of the queue that are not in the list;
- appends them to species-list.txt, each with its counts and "queued, added <day>" as its reason (/about/how: "added
  to since only by the rules below");
- writes grow-list.txt, the species of the list that have no page on disk yet. The added N come first, after any an
  earlier run added and did not build, so a stopped day is made up the next;
- says what it took: the queue's ranks, the counts at each end, and how many are left in the queue.

**The new pages are built online without iNaturalist** (`dossier grow-list.txt --grid climate --bulk bulk --skip
inat`):
- GBIF's records come from its search API: the download does not hold these keys, and the bulk fetcher already
  passes such a key through (`covered`).
- Kew's range, names, the stage-2 sources and the place of publication come from the files in bulk/, as every build
  with `--bulk` reads them.
- Wikidata, Wikipedia, Commons and NASA POWER are asked as in any build.
- The page says iNaturalist "not asked" (rule 2) until the day's fill.

**iNaturalist by the fill, not the build.** `--fill inat` asks thirty taxa a request and reads wild sets from the open
data. A build asks about four times a page (the taxon, wild, cultivated, an id check). So the fill does a day's new
pages at a fraction of the 4,000. The other registers' identifiers come from `--fill elsewhere` (fifty items a
request).

## The daily plan (scripts/corpus-plan-daily.txt, replacing corpus-plan-r87-daily.txt)

```
each-day
dossier --grow 1000
dossier grow-list.txt --grid climate --bulk bulk --skip inat
dossier --fill elsewhere
daily dossier --fill inat
daily dossier --fill bhl
dossier --index
review … expect lines: the pages built, no drops, the index ≥ before + the pages built
upload
live-check
```

The plan line `each-day` is new in corpus-step.mjs. It changes two things.
1. **A new UTC day starts a new run at step 1.** The last run must have finished, or stopped only at a day's
   allowance. A run stopped at a review, a failure or a block is never started over: it stops at the same place.
   Today a finished run of the same plan only says "every step is done", and a daily plan repeats only because
   another plan ran between.
2. **A daily fill that stops at its day's allowance does not hold the steps after it.** The index, the review and the
   upload run, and the fill carries on in the next day's run.
   The round 90 gate still holds wherever `each-day` is not written: there a run stops before the index until every
   fill has finished. Today's BHL fill would hold the upload for about five more days, and the growth cannot wait on
   it.

No backup step: the day adds pages and the fills only add to pages, as the daily plan before. The backup before it is
the last walk's.

## The measures (22 November 2026, in a pause of round 109's copy)

1. **select-species.ts --queue-only** (the counts read again: 120 requests to iNaturalist, 615 to GBIF, kept in
   bulk/select/): 27,864 species queued. 263 have three records or more, reached since the list was made; 8,666 have
   two and 18,935 one. The list is left as it stands.
2. **A trial of 50** (the head of the species to build then, built with `--keys … --grid climate --bulk bulk --skip
   inat`):
   - 50 built and none kept, in 803 seconds with the bulk files' loading included: about 16 seconds a page.
   - GBIF: 555 requests passed to it, about 11 a page; 116 were occurrence searches. No throttle was met.
   - 39 of 50 pages got a habitat climate and 37 a hardiness band; 47 got Kew's range from the file.
   - 13 have no iNaturalist taxon yet, said "not asked: this build left iNaturalist to the daily fill".
   - The 50 are queue species now. `--grow` lists a queue species that has a page already, and does not build it
     again.
   - The first trial ran from Git Bash, whose tar cannot read WFO's zip (CLAUDE.md, round 99), so its pages said WFO
     "COULD NOT BE READ … not asked". They said so truly. `--fill sources --bulk bulk` from PowerShell read it. The
     corpus step runs from PowerShell.
3. **N:** 1,000 a day is about four and a half hours of building, so the day's run ends the same day with the fills.
   Raise it once the day's fills are seen to keep up (iNaturalist's fill reads thirty taxa a request).
4. **The about counts:** /about shows the live counts and, before they come, the snapshot with its day
   (src/lib/ui/about-counts-on.json, written by `--index`). A growing list keeps it true without a deploy a day.
   r86w's check of the snapshot now takes any count from 48,375 up, not the one figure.

## The about pages (rule 5)

- /about/how#list says the queue's rule, the ranking, and that species join it a day at a time.
- The about counts come from the index as before.
- GBIF's derived dataset (DOI 10.15468/dd.pmx97y) covers the API records of the pages it was registered for. New
  pages' records come by the same search, so the dataset is registered again when the list has grown by a few
  thousand (`--list-derived`). Until then, the GBIF credit on those pages names the search, as it does for the
  API-path pages.

## Tests

- r110a (unit): the queue's rank; `--grow`'s pure part (what it appends, grow-list.txt with the unbuilt first, a queue
  run out).
- r110b (unit): `each-day` in corpus-step: a new day starts again, the same day resumes, a review stop is not started
  over, and a spent allowance passes to the index.
- The species list's parser reads the appended reason.

## The gate (22 November 2026)

svelte-check 0 errors in 1,875 files, then `node scripts/predeploy.mjs --tier=app`: 6,482 unit tests in 721 files, then
2,877 browser tests, every test first time in every engine, on the second run. The first stopped at the unit tests on
three timeouts in files this round does not touch (sync-engine's 501 batches, and the mount hooks of r85q-picker and
r85q-species-page); the whole unit suite had passed half an hour before, and passed again with them.

The about snapshot (src/lib/ui/about-counts-on.json) and the search examples were written by the trial's index: 48,425
species. The live corpus is 48,375 until the first daily run uploads, and /about shows the live counts once they load.
