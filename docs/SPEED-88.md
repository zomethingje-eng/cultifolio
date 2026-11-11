# Round 88: the speed round

The owner asked, on 11 November 2026, for the corpus steps to run faster, as long as each change is safe. The measure is
round 87's stage 2: two days for a dry run and a walk of 48,375 pages. Where the time went, from that run's log:

- **GBIF's throttle.** About 1,700 species the download left to the API path (`bulk/api-path.txt`: more records than its
  cut) are asked of GBIF's occurrence search, up to eight requests each. At a fixed 250 ms GBIF answered 3,663 requests
  with a 429 and a Retry-After of 3 s: about three hours of waiting in one pass, and the pass waits for each.
- **The bulk files read again by each step.** About 75 minutes a step to stream the 62 GB occurrence download down to the
  35 M rows kept, and the photographs' 85 M rows, before the first page.
- **Every page derived twice.** The dry run derives all 48,375 pages and keeps nothing; the walk derives them again.
- **One page at a time.** The loop awaits each page in turn, so a page waiting on GBIF holds up every page after it, and
  the build uses one of the PC's sixteen threads.

## The rule for every change

Each change is proved by the pages it writes: the same species built the slow way and the fast way give byte-for-byte the
same dossiers (the build's timestamps aside, which the comparison reads as equal by name). A difference is a bug, never a
trade-off. Nothing here changes what a page says.

## The changes, in the order they are made

1. **GBIF's gap follows its throttle** (`fetch.ts`, `ADAPTIVE`): a first try met with a 429 doubles the gap, answers ease
   it back to 250 ms. Timing only. Test: tests/unit/r88s-pacing.test.ts.
2. **The walk writes to a staging folder** and reports what the dry run reports; the review reads it; a promote step puts
   the staged pages in place. One derivation where there were two, and the review reads the pages that go live, not a
   rehearsal of them. The dry run stays for a run that wants one.
3. **The bulk files read once**: the sealed occurrence sample, the photographs' sample and Kew's names kept in
   `bulk/.cache/`, keyed by each file's size, modified time and the md5 of its first and last 64 MB, the build's own
   options that decide what is kept (the cap, the wanted keys), and the hash of the code that reads them. A key that
   differs reads the files again, as now.
4. **Pages in parallel** within one process: N pages in flight, so a page waiting on GBIF no longer holds up the others;
   the tallies and the log are kept in the jobs' order. Proved by building the fixture corpus at 1 and at 8 in flight.

Left out: rebuilding only the pages a change touches. A page whose inputs changed in a way the shortcut did not foresee
would keep old figures and nothing would say so.
