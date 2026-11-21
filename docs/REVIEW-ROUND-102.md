# Round 102: the record

The front page leads with what the site is. Round 102's plan is `docs/PLAN-102.md` (round 1 of the launch review's
hand-off of 20 November 2026, planned against the code); this is its record.

## What changed

- A visitor's `/` (no plants on the device, no catalogue address) opens on the pitch: the kicker "A plant reference", the
  H1 "{the index's count} species, and every figure says where it came from.", and one paragraph of /about's own sentences.
- One large search box, the page's own (`#search`, the catalogue's search with its region lines, results in place and
  in `/?q=`); the top bar's stand-in box steps aside while it is on the page. A "Try" line under it, read from the day's
  own species: the lead's species, an English name of the strip (it fills the box), a genus of the strip, and the lead's
  first native region's page.
- The day's figure (the lead, `leadOf`, unchanged) as the proof under an H2, "Today's figure, and where it came from",
  with its trail as before.
- Three principles, each in /about's words: "Sourced, not written", "The habitat, then your home", "Open, private, free".
- Browse with its counts and "All {count} species", beside "Changed lately": each round now has a `reader` line, one
  plain sentence; the front page shows the newest three, /changes keeps every line.
- Six tiles of the strip (its rule unchanged) and the record's invitation, with the welcome's ways in (add a plant, the
  example collection, restore a backup).
- No catalogue on the bare `/`. Every catalogue address (`?by=`, `?open=`, `?chip=`, `?from=`, `?at=`) and a grower's
  "All" switch draw it as before, so the sitemap's 3,756 genus addresses, the species page's links, the Worker's page
  cache and their tests hold unchanged.
- /about/how's front-page lines say so; /changes has round 100's entry (its record: `REVIEW-ROUND-100.md`) and round 102's.

## The record

- The strip's photograph rule (PLAN-102 1.7), measured before any change to it: of the strip's 48 pool species
  (featured.json 733cbfe02eb369019b5e01ea909deb01, the corpus on this PC), none holds a Commons photograph
  (`scripts/dev/r102-strip-commons.ts`, written to `bulk/r102-strip-commons.txt`, not in git). The pool is the most grown,
  and each holds 12 iNaturalist photographs or more, so the build asks Commons nothing for them (round 97's rule). A rule
  preferring Commons for the strip would change no tile. Ficus carica's tile stays iNaturalist photograph 428867887, a bird
  at the figs; nothing reads what a photograph shows, and /about/how now says so of the tiles. Ways to settle it are the
  owner's (a photograph chosen by hand and said as chosen, or Commons asked for the strip's pool alone).
- The tests: `tests/e2e/r102a-front.spec.ts` (six: the first screen with one box and no catalogue; the counts the index's
  and six tiles at most; every "Try" link answers; every catalogue address and `/?q=` as before; the bar's stand-in box on
  a catalogue address; one H1, headings in order, every control named, every image with alt text) and
  `tests/unit/r102b-front-words.test.ts` (each front-page claim is /about's own, no count typed, the reader lines). On
  e9f6d64, r102a 1 to 3 failed; 4 to 6 passed and pass.
- The browser tests that read the old front page now read the catalogue's address, `/?by=genus`, which draws it as before,
  so they guard the catalogue unchanged: r61w, r62w, r62bw, r63v, r67v, r73p, r75g, r76p, r82u, r84u, r85m, r86w, r87l,
  r87u, r87rec and smoke 1 to 3. A grower's visits stay on `/`. r69p P4 reads the front page's lead heading by its
  class (an H2 there now). r76p's desktop base measured again on `/?by=genus`. r87p 3 and r87rec read /changes with
  rounds 102 and 100 at the top. smoke-2's scan of `/` waits for the grower's view: WebKit once scanned the moment between
  the visitor's page and the grower's, with no H1 drawn.
- Two shifts as the web fonts arrive, found by the gate and fixed: on a phone the proof's heading at 1.5rem took three lines
  in the fallback face and two in the web face (r62ba N10, 0.115), so it keeps the lead's 1.6875rem; and in Firefox the
  pitch's H1 and paragraph were set in Segoe UI unadjusted until the tuned regular face had loaded (the 600 weight loads
  first), three lines against two and five against four, and the page moved 60 px (r67h engines 4). The phone sizes are
  now 1.8125rem and 0.9375rem, which wrap alike in both.
- PLAN-102's axe check is not run: axe is not a dependency, and adding it changes `package.json`. r102a 6 checks what a
  reviewer checks by hand instead.
- The gate (`--tier=launch`, from PowerShell): svelte-check 0 errors and 0 warnings in 1,842 files, 6,374 unit tests in 709
  files, 2,779 browser tests, every test first time in every engine, on the second run (the first stopped on the tests
  above and the Firefox shift).

## The deploy

- Pushed (f7f2867) and deployed on 21 November 2026 with `node scripts/deploy.mjs` (the full suite first, no stamp): version
  181d6b46. Its live check stopped on one check: the share card's count is compared with the front page's, read from
  "48,375 plant species", which the new front page no longer says. The site was right; the check now reads the H1's count
  ("48,375 species, and every figure…") and the old sentence where an older page is served (`scripts/live-check.mjs`), and
  passed against cultifolio.com: 23 of 23, the share card's count the reference's, 48,375; GBIF still serves the backbone.
  The check's change is committed with the next round, after its gate.
