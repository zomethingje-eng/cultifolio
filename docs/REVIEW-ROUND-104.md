# Round 104: the record

One search, built on 21 November 2026. The plan is `docs/PLAN-104.md`. It covers three hand-offs in one round:

- the second hand-off's round 9 (one search, the header's, everywhere);
- the third's round 15a (the genus that is held);
- the first's round 3 search items (one box per screen; places, which the header's engine already answered).

## What changed

- **The front page's large box is the header's search** (`SiteSearch`, `size="large"`). It has the same engine, rows and
  keys, with its panel under the box and the pitch kept in place.
  - The catalogue's search stays as the panel's last row, "Every species matching …" (`/?q=`), and on every catalogue
    address.
  - With no script, the box is a form that opens that list.
  - The front page's "Try" words fill the box and open its panel (`fill`).
- **Three groups, in order: Your plants, Browse, Species.**
  - **Your plants** is matched in the browser from the open collection: by number, field number, name as received,
    cultivar and species, among plants growing. Rows are grouped by species and give how many plants, their numbers and
    their spaces. Nothing of it is sent.
  - **Species rows say figures:** "record low 4.4 °C · 941 mm a year · wet winters" in the reader's units
    (`src/lib/browse/row-words.ts`). With no habitat climate, a row gives its first native region and its photographs.
  - **A genus with no habitat climate** says so once, on its row ("3 species, 0 with a habitat climate").
- **The genus that is held.** A query of two words or more that nothing answers, whose first word is a genus here, is
  answered with the genus, its count and its family, and no hits (`held`, the `x-search-held` header).
  - The search page says: "No name in the reference is spelt “monstera albo”. It holds 14 species of *Monstera*: all
    of them." It links to the genus's page and keeps "which ones" and "add it as a plant".
  - The panel puts the genus's row first.
  - /about/how#list says the list holds species, so a cultivar or a trade name has no page.
- **Nothing at all:** the panel says "No name in the reference matches “qzxwvk”." in one line.
- **One box per screen.** The bar's stand-in box steps aside on the search page (`/?q=`) as on the front page.
- **The index carries `rain` and `yr`.** These are the rain a year (`yearRain`) and the season (`seasonKey` of
  `growingYear`, the species page's own words), written by `--index` from each dossier, with no page built.
  - /about/formats names them.
  - Until the index is written again, a row shows what the entry holds: the record low, else the family.
  - The index step is `scripts/corpus-plan-r104-index.txt`.

## What the plan said and the build did otherwise

- **The bar's stand-in box stays on a catalogue address.** Round 102 kept it there on purpose, because the page's box is
  lower (r102a 5). It steps aside on the home page and on the search page, which are the two the hand-off names.
- **A row with no figures keeps its family.** Against the fixture's index, which has no `rain` or `yr` yet, species rows
  stood bare. The live index will look the same until the index step runs.
- **The empty line says "in the reference".** The hand-off's "No name matches" sits under Your plants rows that may match
  by name, so the line says which names it means.
- **The held genus's family comes from one more search**, of the genus alone, made only for a query that found nothing.
  `genera.json` holds no family.
- **Your plants with several plants opens `/plants?q=<species>`.** The plants list has no server load, so a press sends
  nothing. A link opened in a new tab is a request like any plant's own address.

## The record

- **New tests.**
  - r104a (unit): the season key against the page's season words in every branch, `habitatYearOf`, the row words in
    both units and for an older index, the genus row's climate count, and the held genus through the route, its cache
    and its shaped answer, but not for one word, a species found or a first word that is no genus.
  - r104b (browser): the large box's groups and Enter, the held genus in the panel and on the search page, the empty
    line, Your plants with no request carrying the plant's number, the box with no script, and one box per screen.
- **Tests moved.** Those that typed into the bare `/`'s box to test the catalogue's list in place now type at
  `/?by=genus`, which draws that box as before: r62bq, r62bw, r77k, r81s, r82s, r83k, r85u, smoke 3 and 4, and,
  found by the first launch gate, r79k, r80n, r80s (its letter index too) and r81u 2. r102a 4 reads the panel. r87l 3
  reads the large box. r87p and r87rec put round 104 at the top.
- **Measured again.**
  - r76p strip 2's desktop base: "Changed lately" on a catalogue address opens on round 104's three lines, a line longer
    each, so the strip sits 22 px lower at 1280 and 21 at 1024 (the first gate failed on it in every desktop engine).
  - r80u offline 2's ceiling: the front page draws the header's search itself, so its styles are a file the install
    fetches. The install list is 168 build files; WebKit counted 181 and 183 (179 or 180 at most on rounds 98 to 103), and
    failed once at the old ceiling of 182. The ceiling is WebKit's 183 with its margin of two.
- **The first gate:** 34 failed (the tests above). **The second:** 2,835 passed and two passed on their retry, r80u
  offline 2 (above) and r60 3 in Firefox (a press on the import page's "Make these spaces" box that did not take under
  load; the import page is untouched by this round, and it had not failed before).
- **The launch gate, the third run:** svelte-check 0 errors in 1,852 files, 6,421 unit tests in 713 files, 2,837 browser
  tests, every test first time in every engine (WebKit's install 175 and 177 files).
