# Round 117: the lower page (SPECIES 22)

The species hand-off's round 22. Built in the clone (Desktop\AI Work\cultifolio-check) from 23 November 2026, beside rounds
111 to 116's gate in the project. It is copied into the project only after that gate and its commit.

## Done in the clone

- **Similar climates:** a tile of a species the reader grows says "You grow this" and comes first.
  - It is decided in the browser from the open collection, as the plant list's lens decides it (`$lib/browse/lens`).
    Nothing is sent.
- **Photographs:** rows by what each source marks, each with its count and at most six from as many observers.
  - The rows are In the wild, In cultivation, and Not marked by their source (Commons and GBIF, never called wild;
    round 30, rule 3).
  - "Show all" lays every one out as before.
- **Where it grows wild:** "Ground" first among its facts. It gives the typical cell's elevation (ETOPO 2022), and says
  that the range across the cells and the soil are not read yet. The records counts ("Evidence used") and flowering were
  there already.
- **Names & registers:** the same content in columns from 900 px, each block whole (CSS columns, so no word or order
  changes).
- **Cite this page:** the site, the name with its author, the build's day (the reader's calendar, `localDateOf`) and the
  page's fingerprint, and the address. It has a Copy button and the page's data as JSON (`/api/dossier/<id>`).
  - The CSV comes with SPECIES 19's table.

- **The record's three parts** (`RecordParts.svelte`), over "Where this page came from", which stays whole:
  - the registers that accept the name (Kew's file with its day and entry; World Flora Online with its release and id);
  - "Looked for, and not there", only sources that answered with nothing (rule 2);
  - "Where each figure comes from", the sources that answered, each with the day read.
  - Every state word is `registerRow`'s.
- Also in this commit, the daily run's two fixes of 24 November (docs/AWAY-2026-11.md):
  - the photograph step's exit code decides (scripts/corpus-step.mjs);
  - a host that stops answering leaves its few for the next run (scripts/img-copy.ts);
  - r110b's two tests cover them.

## Left for later rounds

- **The section order and the nav's labels** wait until SPECIES 19's year panel and SPECIES 20's lens have taken "At
  home".
- **The CSV** comes with SPECIES 19's table.

## Tests

- `tests/unit/r117a-record.test.ts`: the three parts. A source not asked, refused or failed is in neither list. It
  FAILED on 1764df3.
- r79k reads the registers' links inside the Names columns. r87p, r87rec and r76p hold /changes' and the front page's
  newest lines.
- In the clone: 6,541 unit tests, and the Chromium suite (desktop and phone) after those shifts.

## The gate and the deploy

svelte-check 0 errors in 1,893 files; 6,541 unit tests and 2,946 browser tests, every test first time in every engine (WebKit and Firefox at one worker each), on the second run: the first stopped at r81h, the five hybrids the day's growth added (the table made again, 518). Committed as 19ec7a8, pushed, and deployed on 24 November 12:35 EST; live check 24 of 24.
