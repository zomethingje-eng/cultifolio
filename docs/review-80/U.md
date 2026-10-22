# Round 80, agent U: the app's pages and the phone

Copy `/tmp/claude-0/rev80f/U`, branch `r80f`, six commits on tag `r80f` (`git log --oneline tags/r80f..r80f`). Scratch `/tmp/claude-0/rev80f/U-s` (notes, tools, run logs; a detached worktree of the base at `U-s/base`, used to prove the tests fail on `r80f`).

Every change below is app code (pages, styles, the service worker, a build plugin) or tests and docs. None touches `scripts/build-dossiers.ts`, `src/lib/dossier/`, `scripts/corpus-step.mjs`, any plan file or any dossier. **All of it is safe to deliver mid-fill**, between two fill days or during one: it reaches the site with `npm run deploy` and changes nothing the fill or the plan reads.

## Done

**1. Phone: Back to the catalogue with a row open ran to the end of the list** (review P 1).
- Cause, confirmed: the page that comes back holds only the server's window of rows, so the saved pixel position was past its end, was clamped to the foot, and Chromium's scroll anchoring kept the foot in view while chunks went in above it.
- Fix, `src/routes/+page.svelte`: the page now keeps a SvelteKit snapshot of the row or opened tile at the top of the screen and its offset (with grouping, chip, row count and open row). Back fetches the rows around it if they are not in the server's window, puts it back where it was, and holds it there for up to 0.9 s while late layout settles (the tiles' last lines moved it about 40 px on a desktop). It stops holding the moment the reader touches, scrolls or types. Neither sentinel fetches while this runs.
- `overflow-anchor: none` on both sentinels (`.more`) and on `footer.credits` (`src/routes/+layout.svelte`), so the foot is never an anchor.
- Test `tests/e2e/r80u-back.spec.ts`. It serves a 3,000-genus catalogue through `__data.json` and `/api/rows`, because the fixture has four genera.
  - Tests 1 and 2 (with a plant on the device): the tile is back within 4 px, stays there, and fewer than 500 rows and at most 3 chunks are loaded. On `r80f` both failed at both widths: scrollY 121,538, 1,515 rows, 9 chunks after Back.
  - Test 4: a reader 150 rows past the opened one comes back to that row, which is outside the server's window.
- **Also item 3's second half (review P 8):** the top bar's "‹" now counts history steps by `nav.delta`, so a browser Forward is no longer counted as a Back (`+layout.svelte`). Test r80u back 3 follows the review's steps. On `r80f` it went to `/`.

**2. Plant page: the card covered the photograph strip; the hero was a 150 px slice in a 260 px box** (review P 2 and 4).
- `src/routes/plants/[acc]/+page.svelte`: `:global(.ptl) + .idcard` has no negative margin (14 px; 10 px on a phone).
- On a phone, `max-height: none` for the grower's photograph and the species' photograph. The theme's `.hero img { max-height: 150px }` is a species-page rule.
- The box sizes do not change, so nothing moves under round 78 and 79's holds. `r78m-verbs-steady` and `r79f-steady` pass.
- Test `tests/e2e/r80u-plant.spec.ts`:
  - plant 1: the card starts below the strip, and a tap at a thumbnail's foot lands on it. On `r80f` the card started 40 px into the strip on a desktop and 26 px on the phone.
  - plant 2 and 2b: each photograph fills its box. On `r80f` they failed on the phone, 150 against 260.

**3. Offline, Compare opened the browser's error page** (review P 5).
- `src/service-worker.ts`: any navigation not otherwise handled goes to the network and, offline, gets the app's `/offline` page. That covers `/compare`, `/privacy` and `/frost`.
- Test r80u offline 1 covers `/compare` with and without a query, `/privacy`, `/frost` and an unread species page. On `r80f` it failed with net::ERR_FAILED.

**4. Layout and wording** (review P 6, 7, 9; review W 8, 9, 11, 12, 13). Test `tests/e2e/r80u-layout.spec.ts`, 12 tests; each failed on `r80f` where it runs.
- **Notices (W 9).** The toast sits at the window's foot at every width (`src/lib/ui/ToastBar.svelte`). It is lifted above the select bar by its measured place, and above the compare tray on a desktop. Test: after Water, the toast does not cover the plant's name.
- **Month table (P 6).** `table.wx` loses `overflow: hidden`, which made the table its own sticky cells' scroll container. The corner cells round themselves instead (`src/lib/ui/theme.css`).
- **Section tabs' fade (P 7).** The mask is gone. A sticky `::after` gradient in the bar's colour fades the labels only.
- **Empty gap on the add form (P 9).** A name that came with its key from a species page keeps one line of room for the check, not three, until the grower types. The three come back on the first keystroke, before the field is left, so round 67's no-move rule still holds. This is the new `linked` prop on `src/lib/ui/SpeciesPicker.svelte`; `src/routes/plants/new/+page.svelte` sets it from the URL at init.
- **Fields (P 9).** `.field` inputs and selects get `min-height: var(--tap)`, which is 44 px on a phone.
- **"Pakistan· introduced" (P 9).** Svelte 5 trims the leading space inside an element. A scan of every component found 13 such spans. The 11 that lost a real space now use `{' · '}`:
  - species page: native, introduced, doubtful, extinct, range source and ambiguous;
  - the select list's place, the plant log's photograph caption, compare's "replaces", and the propagation batch's "still in the pot".
  - The two unit spans (`.u`, " d" and " DLI") keep their 2 px margin.
- **Two rain totals (W 12).** The spread season's lead in `src/lib/core/sheet.ts` now reads "Rain spread: 70% of the median year's rain takes N months, so no short rainy season." It no longer states a second year's total beside the glance card. The unit test `tests/unit/r60x-arch.test.ts` was updated to the new words and fails on `r80f`.
- **Other faults the reviewers listed:**
  - facts grid (W 13): flex on the species page, so a lone "Native" takes its line;
  - map caption band (W 13): the caption fills the box under the map;
  - "rests on all 1 georeferenced record" now reads "on the one georeferenced record";
  - "You grow" chip over the placeholder letter (P 9);
  - a failed related tile now says "did not load" in its square (P 9);
  - the hint names the button as it reads, "press “Add as typed”" (W 11). Three specs' matchers were widened for it (`helpers/smoke.ts`, `smoke-3`, `r63v-visitor`);
  - the collection pages' unused-font-preload warnings (P 9): the preloads are now in the server's HTML only.
- The desktop letter index (W 8) is agent S's. S fixed it in the same CSS, so I took mine out.

**5. The install's precache** (review P 10, review W 16).
- A build plugin, `scripts/offline-files.mjs`, registered in `vite.config.ts`, works out from the client manifest which build files are needed offline:
  - Kit's entries and the layout, error, front-page and collection nodes;
  - everything they import, including on-demand imports such as the spreadsheet writer and the example seed;
  - never the app entry's list of every node.
- It hands that list to the worker's build as `__OFFLINE_BUILD__`. The worker precaches only those files, and of the static files only `favicon.svg`, `manifest.webmanifest` and `icon-192.png`.
- `og.png`, the 512 px icons, the maps and every `.woff` (non-WOFF2) are out. Each is kept the first time a page asks for it, as before.
- If the hand-over fails, the build says so and the worker caches the whole build, as now.
- Tests:
  - r80u offline 2: none of those files is fetched by the install. Failed on `r80f`.
  - r80u offline 3: with the network cut after the smaller install, every collection page opens, by address and by the tab bar, as does a plant page and a species page read online. Passes on both; it guards the trim.
  - unit `tests/unit/r80u-offline-files.test.ts`. Fails on `r80f`: the module is missing.

**6. Orchid "55 °F convention, no source given" (review W 15): not changed.** This is a decision for the owner; see the end of this report.

**About pages and DEPLOY.**
- `/about/how`, three sentences, all now true of the code:
  - `sveltekit:snapshot` used to say "no page asks it to keep anything". It now says what the front page keeps.
  - The install sentence now lists what is fetched and what is kept on first use.
  - The cache-storage sentence was updated to match.
- `docs/DEPLOY.md` has a new section, "Round eighty: the app's pages and the phone (agent U)", placed after the most-voted photographs section.

## Repairs for the live site

None. No change alters a dossier or a corpus file. The rain wording and the evidence wording are drawn when a page is viewed.

## Needs (for the merge)

- **O, `vite.config.ts`:** O and I both changed the `plugins:` line. Merged, it should read `plugins: [corpusOnDisk(), sveltekit(), offlineFiles()]` with my import line.
  - O moved `static/*` to `static/app/` (`files.assets`). My worker list uses served paths (`/favicon.svg` and so on), so it is unaffected.
  - Please keep `og.png`, the maps and the 512 px icons served at the root.
- **S, `src/routes/+page.svelte`:** my hunks are the snapshot block before `afterNavigate`, the `restoring` guards in `maybe` and `growWhileNear`, and the `.more` and `.ownchip` CSS. S's letter-index CSS stands; mine is gone.
- **A, species and plant pages, `sheet.ts`:** no overlapping hunks, by inspection of A's diff.
- **Several agents, `/about/how`:** mine is three sentences in the storage and worker paragraphs (lines 91 and 97).

## For the owner's PC

Nothing to run beyond the next `npm run deploy`. The build should print `offline-files: the service worker caches 138 build files at install`.

## Measured

- **Precache**, read from the built worker by `U-s/tools/precache-count.mjs`:

  | | Requests | As files | Compressed (gzip estimate) |
  |---|---|---|---|
  | `r80f` | 170 | 2,086 kB | 898 kB |
  | This round | 146 | 1,263 kB | 552 kB |

  - JavaScript 106 to 93, CSS 38 to 34, static files 8 to 3, WOFF 2 to 0.
  - The 12 pages the Worker itself renders (11 shells and `/`) are unchanged. On Workers, static asset requests are not counted against the request allowance; those 12 are.
- **Back, the base:** after Back the page sat at scrollY 121,538 with 1,515 rows and asked for 9 chunks in 3 s. With the fix: the tile within 4 px of where it was, 80 rows, no chunk asked for.
- **Runs:** every spec I touched or wrote, strict, Chromium and phone (one run of 117 tests, all passed):
  - mine: r80u-back, r80u-plant, r80u-offline, r80u-layout;
  - touched: smoke-3, r63v-visitor;
  - the round 78 and 79 holds: r78m-verbs-steady, r79f-steady.
- **Regression runs**, strict, both projects, all passed:
  - 159 tests: r62a and r62ba interface, smoke-4, r75g-range-cell, r67h-disclosure, r70p-save-moves (with the above);
  - 148 tests: r73p-first-visit, r67h-offline, smoke-1, smoke-2, r60-grow, r76p-strip, r63v-first-screen, r73p-front, r62w-pages, r62bw-pages, r61a-a11y, r79k-no-gbif, r77c-maps, r61l-records, r66y-engines, r69x-example.
- **Types:** `tsc --noEmit -p .` clean; `svelte-check --threshold error` gives 0 errors and 0 warnings.
- **Unit suite**, run once and alone: 467 files and 4,335 tests. One test failed: `r70p-about-seams`, which held the old "no page asks it to keep anything" claim. It now checks the new sentence and that `src/routes/+page.svelte` is the one page exporting a snapshot. With that fix, 3 files and 41 tests pass (r70p-about-seams, r80u-offline-files, r60x-arch); the rest of the suite passed as it stood.

## Not done, with why

- **Review W 10 (the "your species" tiles misname hybrids):** not in my list, and not done.
  - Cause: `mySpeciesOf` in `src/lib/db/species-list.ts` names a tile `speciesOf(name)`, which drops the "×" of a nothospecies. The display could use `parseName(name).scientific` when `kind === 'hybrid'` and there is an epithet.
  - A genus-level plant ("Echeveria 'Perle von Nurnberg'") shows "not in the reference". It would want a tile that opens the genus row; that is a design choice.
- **Review W 4 (plant-page notice for keyless pages):** agent A has it (`keylessPlantNotice`).
- **Search counts (P 3, W 2), the picker's odd suggestions (W 11, first half) and the letter index (W 8):** agent S's.
- **Real Safari:** not available here. The snapshot restore relies on SvelteKit's snapshot, which is engine-neutral. The anchoring fix is Chromium's concern, and Safari does no CSS scroll anchoring.
- **A tab still on the previous build after a deploy, on a species or about page:** it now finds fewer of its old chunks in the worker's cache. Kit reloads a page whose chunk fails to load, so the grower lands on the new build. Before, every old chunk was cached.

## Decision for the owner: the care-group conventions (review W 15)

- **What it is.** `src/lib/core/arch.ts` holds one figure for each of four care groups: tropical foliage plant 12 °C, orchid 13 °C (55 °F), epiphyte 10 °C, fern or moss 5 °C.
- **How the page shows it.** The page prints it as "the convention for orchids grown indoors is 55 °F; no source is given for it". `/about/how` calls it "the author's statement of a growers' convention". It never raises or replaces a cold floor.
- **Why it is a question.** It is honest, but it is a figure without a source, against rule 1.
- **Options:**
  1. **Keep it as is.** The page says plainly that it is unsourced.
  2. **Remove the four figures.** The page would keep the care group and its reason, with no number. This takes edits to `arch.ts`, the sheet's sentence and the `/about/how` paragraph.
  3. **Source them.** Name one published growers' reference for each figure, for example a national orchid society's culture sheet, and print the citation. The figures may change to match it.
  4. **Move them under "How this section is made".** Keep them, but out of the sheet itself.
