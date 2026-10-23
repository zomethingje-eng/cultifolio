# Round 81, agent H: hybrids, end to end

Copy `/tmp/claude-0/rev81/H/`, branch `r81` from `r81base`, five commits (`git log r81base..r81`). Scratch `/tmp/claude-0/rev81/H-s/`.

## Done

### W3 and D3: the sign on all 485 hybrid pages, and their links

**Where the sign comes from.** `scripts/species-list.txt` writes each of its 485 hybrids as Kew's file does (473 nothospecies, 12 nothogenera). Each one is a `k` page whose index name is Kew's name with the sign taken out. I checked all 485 against the live index (`rev81r/D-s/raw/index.json`).

- New `scripts/hybrid-names.ts` (`--bulk <dir>`, `--check`) reads the list's lines that carry "×" and those lines' rows in `wcvp_names.csv`. A row is taken only when Kew gives the same name, a hybrid marker and Accepted (0 refused, 9 s).
- It writes `src/lib/core/hybrids.json` (60 KB, by plant_name_id): the name with its sign, IPNI and POWO numbers, and Kew's `hybrid_formula`. The file is bundled in the Worker only.
- New `src/lib/core/hybrids.ts` gives `signedName(key, name)`, `hybridOf`, `hybridLinks`, `withKewLinks` and `signEntries`.
- `src/lib/core/names.ts` gains `withoutSign` and `nameOrder` (alphabetical order read past the sign).

**What the app does** (it reaches the live site with the deploy; no rebuild):

- **Species page** (`species/[slug]/+page.server.ts` lines 144–147, 155, 220).
  - The heading, `<title>`, JSON-LD, alt texts, Follow, Compare, notes, the add link and the Related tiles all show the sign.
  - It does this by signing the `shown` copy of the dossier. The load's own name comparisons still read `d`, without the sign.
  - A new line "A hybrid: M. aquatica × M. spicata, the parents Kew's World Checklist states for it (WCVP, RBG Kew)" (`#hybrid-parents`, `+page.svelte` 459).
  - Where the record links neither POWO nor IPNI, the page links Kew's entry numbers and says so (`#hybrid-links`, 796).
  - `+page.svelte` line 78: the page's own name, with or without the sign, is not listed as an older name.
- **Compare** (`compare/+page.server.ts` 22–23) is signed the same way.
- **Addresses** (`lookup.ts addressOf`). An address written with an "x", such as `/species/mentha-x-piperita` or `x-…`, moves to the page's own address. Both forms are 404 live today.
- **Name maps** (`dossier/lookups.ts`). The accepted-name map, `plainName` and the name files key names without the sign. Genus rows sort with `nameOrder`, as does `dossier/catalogue.ts` (lines 133 and 194).

**At `--index`** (`build-dossiers.ts` lines 118, 1814–1825 and 2344):

- The index text and every product (entries, cards, name files, rows, search key files) carry the signed names (`signEntries`).
- The photograph judgement still reads the unsigned names, so no dossier is written.
- The build's own index write is signed too.

**At build** (`dossier/build.ts`, after the fallback): a hybrid with neither number links its Kew entry's numbers, found by its page id. The cause was `kewIpni` at `gbif.ts:268`, which drops rows that carry "×" when the name asked has none.

**Search.** "Mentha × piperita", "Mentha x piperita", "Mentha piperita", "mentha xpiperita", "× Astrolista", "x Astrolista bicarinata" and "Astrolista" each answer the hybrid first. I checked this both in memory and through the file-based `/api/search` on the real corpus (Measured).

**The front page's own search** (`+page.svelte` ~527) now reads past the sign. Without this, "aloe nobilis" would stop finding the now-signed tile.

**About pages.**
- `/about/how` line 36: a new paragraph on where the sign comes from, the 485 hybrids, Kew's file of 2026-06-04, the address move and Kew's links. A test checks the count and the day against the table.
- `/about/formats`: the taxon record's id and name, and label codes.

**Tests.** `tests/unit/r81h-hybrids.test.ts` (11 tests):
- the table equals the list, and Kew's file row by row (485);
- the reviewers' examples;
- Kew's links and the "-4" case;
- the 28 live dossier copies the reviewers fetched (`fixtures/r81h-live-hybrids.json`): the 7 that link nothing get Kew's numbers (Fragaria × ananassa 30117681-2, Sarracenia × farnhamii 77148221-1, and Solidago × lutea, which D3 counted as a non-hybrid);
- the maps, the name files, the order, the address move, and the about sentence.

It fails on `r81base`: `$core/hybrids` is missing, `byName` keys the signed form, the row order puts "×" first, and `mentha-x-piperita` was asked of GBIF.

**Safe mid-fill:** yes. The fill does not read any of this. `--index` changes only the names of the hybrids' entries. The plan and `corpus-step.json` are untouched.

### The hybrid and genus tiles of "your species", and the device's database

**The premise was half wrong, which decides the migration.** Round 80 said the reference's slug is `aloe-x-nobilis`. In fact none of the live index's 48,361 slugs carries an "x" word. Every hybrid page's address is its name without the sign, and that is exactly the device's `speciesSlug`. So the taxon record ids already meet their pages and are not changed. The only thing older builds got wrong is the record's `name`: "Aloe nobilis", from `speciesOf`.

**The migration is a reading rule.** Since round fifty-six the project writes its migrations this way: the one-shape pass became `accNo`/`sowNo`, and "no reading of the log writes to it".
- `shownSpeciesName` (`db/species-list.ts`) shows the plants' name with the sign where the stored name is that same name without it.
- Nothing is written, so no record is renamed.
- The writers now store the sign: `speciesName` in names.ts, used by plants/new, propagation/new, the import commit, `notesTaxon` and demo-seed.

**Genus tile.** A plant filed under its genus or nothogenus (`isGenusOnly`) gives `genus: true`. Its tile reads "genus: its row of the catalogue" and links `/species/<genus>`, which the route answers with the genus's row, or with a 404 saying the reference has none of it (`+page.svelte` Tile type, `toTile`, fig text).

**A reference hybrid reaches its page.** A named nothospecies (`isNamedHybrid`) is asked of the reference like a species:
- on the plant page (`asSpecies`, lines 120, 291, 671, 678, 687), so Mentha × piperita links its species page;
- in its label code (`qr.ts` 56).

**Proved on a real backup.** The backup is review W's import of 300 plants on the live site, made by the round-80 app (`tests/unit/fixtures/r81h-backup-r80-300.cultifolio.zip`, 5,486 changes). `r81h-your-species.test.ts` (22 tests) restores it through `io.ts` into a fake IndexedDB and loads this build in a new page life. Then:
- the log equals the file, change for change;
- all 300 plants keep their name, number, key and cultivar;
- the 43 tiles have the round-80 reading's slugs;
- exactly one name differs ("Aloe nobilis" becomes "Aloe × nobilis");
- exactly one genus tile appears (echeveria);
- the stored record still reads "Aloe nobilis".

`tests/e2e/r81h-hybrid-tiles.spec.ts` restores the same file through `/backup` and checks the tiles. It passed in Chromium in 51 s. It sets `serviceWorkers: 'block'`, counts nothing, and waits by `whileStoring`.

Both fail on `r81base`: the functions are missing, and the base tile reads "Aloe nobilis · not in the reference" and "Echeveria · not in the reference".

**Safe mid-fill:** yes. These are app files only.

## Repairs for the live site

None. The app applies the sign and Kew's links from the deploy on. The plan's own step-12 `--index` (or (d)'s) writes the sign into the index, search and tiles, if this is delivered before the fill's last day. If delivered later, the next `--index` does it. No page needs rebuilding.

## Needs

- **S, how ×, "x" and nothing are read.**
  1. Keep these working in the file path: `words()` dropping "×", "x" in `RANK_MARKERS`, and the exact-name rank. Add "Lantana x strigocamara", "× Sorbaronia", "Sorbaronia arsenii" and "Mentha xpiperita" to your tests if you touch the reading.
  2. In `search.ts:497`, change `sortKey: fold(item.name)` to `fold(withoutSign(item.name))` (`$core/names`), so a nothogenus sorts under its genus as the rows now do.
  3. W4: in `import/check.ts:59`, check a named nothospecies (`isNamedHybrid(p)`) by its `speciesSlug` as a species is checked. Today "Mentha × piperita" is filed "hybrid" without asking.
  4. I edited `+page.svelte` ~527 (`ownHits`): please merge with your W1/P1 lines.
- **U.** My lines:
  - the plant page's `asSpecies` (120, 291, 671, 678, 687);
  - `compare/+page.server.ts` 22–23;
  - the front page's Tile, `toTile` and fig.
  W2/P5's picker shows `e.name`, which carries the sign after the index.
- **B.** My `build-dossiers.ts` lines: 118 (the import), 1814–1825 (`shownIndex`) and 2344. If you skip the index after a fill run that changed nothing, the explicit `--index` (step 12, (d)) must still write. In the owner's walk, after the deploy, run my section's three checks (DEPLOY `### Round eighty-one: hybrids`).
- **A.** My `/about/how` sentence follows "Names are compared without the hybrid sign…" (line 36). Please merge around it.

## For the owner's PC

Nothing to run. To optionally confirm the table against the PC's Kew file: `npx tsx scripts/hybrid-names.ts --bulk bulk --check` should print "is the list's and Kew's: 485 hybrids". After the deploy, run the three checks in DEPLOY.

## Measured

- **Round 77's real corpus**, rekeyed twice, base against mine (8,947 pages, `H-s/rekey-*.log`):
  - 239 s and 246 s;
  - dossiers 0 of 8,947 differ, and the judgement wrote 0;
  - the index differs on 3 entries (Lantana × strigocamara, Parodia × erubescens, × Sorbaronia arsenii) and only in `name`;
  - 77 of 690 product files differ, all from those 3 names; no name-file key carries "×"; same sizes.
- **Served locally** with `vite dev`, on that corpus:
  - the title "Lantana × strigocamara (Red-sage)", the heading, the JSON-LD and the parents line;
  - `/species/lantana-x-strigocamara` and `x-sorbaronia-arsenii` answer 301;
  - the 7 searches above answer the hybrid first;
  - the Parodia row lists erinacea, × erubescens, formosa.
- **Live:** 2 requests (the two "x" addresses, both 404).
- **Unit:** the whole suite at the final code, alone, under nohup: 493 files passed (1 skipped), 4,494 tests passed, 10 skipped, 681 s. Before that, the 55 targeted files: 551 passed, 2 skipped.
- **Types:** `tsc` 0 errors; `svelte-check` 0 errors. The `tsconfig.scripts.json` errors are the base's only.

## Not done, with why

- The `/api/dossier/<id>` JSON keeps the build's unsigned name. It is the build's record, and the page and the index carry the sign.
- "mentha xpiperita" typed on the front page's own-tile search is not read as a sign: reading a leading "x" there made "xe" match everything. The server search reads it.
- I did not run the e2e spec on base, or in the phone project, which ran no test of this spec.
