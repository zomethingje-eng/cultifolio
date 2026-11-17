# Round 94: the extra-keys lists made again whole (the record)

The plan: docs/PLAN-94.md. Run on 16 to 17 November 2026, on the owner's word ("Run it all the way as round 93 did"): the
gate, commit and push, the corpus plan, and the deploy after a fresh gate because the index rewrote the about counts.

## The gate (16 to 17 November 2026)

`node scripts/predeploy.mjs --tier=launch` on the lists and the two tests. The first run: 2,736 passed, one flaky, r76p
strip 4 at 320 px in Chromium (a tile's credit "outside its card"), the same test round 93's gate found flaky; passed on
its retry, so the strict run failed. Run again unchanged: svelte-check 0 errors and every test first time in every engine
(2,737 passed, 23 skipped). Committed and pushed as 9cccb66.

## The run (17 November 2026, 01:53 to 04:21 UTC)

`node scripts/corpus-step.mjs --plan scripts/corpus-plan-r94-lists.txt`, every step done; the site serves corpus
bb107c441a037973.

### The dry run and its review

13 pages derived, 12 changing; records admitted 0, dropped 0 (rule r87 against r86); climates 9 gained, 0 lost; typical
spots moved on 2 pages: Viola stipularis 7.9 km and Potentilla atrosanguinea 129.3 km, each within its own province
(Tungurahua, Uttarakhand), with the same records and cells (round 90's rule for the typical spot, these pages last built before it).

The review was written to stop every time, but it carried three `expect` lines, and corpus-step carries on past a review
whose checks all hold (P = 13, A = 0, D = 0). So it did not stop. Its figures were read afterwards from corpus-step.log;
they hold, and two of the plan's expectations were wrong, not the build:

- "Offline, only Maytenus acuminata can gain": ten pages gained records in the dry run, nine besides it. The offline build still asks
  GBIF's occurrence search for keys the download does not hold ("44 asked"), so the dry run read them. The online build
  gave each page the dry run's figures.
- "Viola stipularis loses the records GBIF identifies as Viola fruticosa": the page is unchanged, 776 records of key
  8347707, 351 open and 136 restricted in range. Its line lists 5665280 among the keys not read. GBIF holds 4 records under
  5665280 (asked 17 November 2026), all preserved specimens without coordinates, so none was among the page's records
  before. The rule applies; it leaves out nothing the page counted.

A plan that wants a review to stop every time gives it no `expect` line.

### The pages

| Page | records in range (open + restricted) | climate | photographs |
|---|---|---|---|
| k2344177 Ligusticum ferulaceum | 0 → 163 + 8 | gained, 77 cells | 0 |
| k2360109 Maytenus acuminata | 0 → 226 + 261 | gained, 183 cells | 64 |
| k2461487 Viola stipularis | 351 + 136, unchanged | typical spot moved 7.9 km | 61 |
| k2476687 Strobilanthes maculata | 0, unchanged (its one record lies outside the range) | none | 5 |
| k2551191 Pimelea villosa | 0 → 165 + 0 | gained, 27 cells | 83 |
| k2727610 Cleome spinosa | 0 → 402 + 14 | gained, 45 cells | 79 |
| k2760205 Delphinium patens | 0 → 20 + 204 | gained, 139 cells | 65 |
| k2800308 Erysimum ochroleucum | 0 → 11 + 0 | gained, 10 cells | 2 |
| k2836016 Gymnosporia acuminata | 0 → 5 + 11 | none (58 records at 16 places, none placed to within 10 km) | 0 |
| k2861129 Ilex myrtifolia | 0 → 173 + 97 | gained, 89 cells | 76 |
| k2953596 Potentilla atrosanguinea | 18 + 72, unchanged (11336234 holds none) | typical spot moved 129.3 km | 18 |
| k3234994 Haplopappus glutinosus | 0 → 35 + 4 | gained, 6 cells | 40 |
| k3320793 Alsophila dealbata | 0 → 177 + 282 | gained, 226 cells | 12 |

Maytenus acuminata (3791985, 701 records) and Gymnosporia acuminata (7662985, 3791158, 7265620) read no key in common.

### The build, the fill, the index

- The build: "13 built, 0 kept of 13"; no drops.txt (no page lost what the build before had).
- The flowering fill: 32,284 pages counted (32,283 on 16 November), 264 with no GBIF key (275).
- The index: 48,375 species; climates for 38,007 (37,998); no "NOT TRUE of this index" line. It rewrote
  src/lib/ui/about-counts-on.json and tests/unit/fixtures/about-search-examples.json (the counts and the day only).
- The second review's checks held: B = 13, F = 48,375, N = 32,284, I = 48,375.
- The upload: every product file checked by its MD5 (67,052), rclone check 0 differences; 11 dossiers in the bucket not in
  the index, reported, nothing deleted.
- The live check: 23 passed; the site serves bb107c441a037973.

## The deploy

The about counts the index wrote (38,007 climates, 17 November) are in the app, so a fresh launch gate on them, the
commit, and `node scripts/deploy.mjs`.
