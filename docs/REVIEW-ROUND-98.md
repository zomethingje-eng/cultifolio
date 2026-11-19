# Round 98: the Commons count's group C, the Commons row a build did not write, Namibia's regions, the Walter–Lieth diagram (the plan and record)

Written 19 November 2026. The owner: "would there be anything left outstanding for any future rounds? if so, do everything
in this round". Launch tier (the app changes: the species page's diagram, /about/how, /changes), then the corpus plan, then
the deploy.

## What was outstanding

Every item a round since 86 left for later, read against the code (each round's record, the code, the tests):

- Done since it was left: the border allowance's old provinces and codes (r87, state-aliases.ts); the 337 older-name
  strings classified (r87, older-kinds.ts); W12 (/labels, r87t3); homonyms said by Kew's author (name.kew.by); browse, the
  look, At home, a hybrid's parents and the search tests (round 87); the Commons count before duplicates (ownShown, r87d);
  the drops audit on the written page (r87d); an offline walk keeping its range (r87d, r90d); a carried summary's proof
  and literature off (r87d, r87f); the old @fontsource packages (fcf3edf); flowering for pages with no iNaturalist taxon
  (round 92's download); the extra-keys lists made again whole (rounds 94, 95); round 92's keys (round 93);
  PENDING-ABOUT-HOW-R79 (round 87's /about/how).
- Held by decision, unchanged: review D's D8 (open sea inside a mainland region's box: every test by drawn land also
  drops real islands) and D2 (Xeronema's typical spot); round 93's held names; splitting a batch into items.
- Open, and done in this round: (1) the Commons count's group C (PLAN-97), and the Commons row a build did not write,
  found while answering; (2) ISO subdivisions not matched to a Natural Earth province (round 87, 4); (3) the Walter–Lieth
  diagram (round 87, 4).
- Open, each its own round next: the collection encrypted on the device (docs/about-87/t3.md, "Proposed, not built"), round
  99; the move to the Catalogue of Life (docs/COLXR-87.md, 5: the key map, the dry-run count, the model, a trial build,
  then the owner's decision), round 100. A security change to the owner's own records and a taxonomy trial each want
  their own gate and record, not a corner of this one.
- Not a round's work: the BHL daily fill (about 18,400 of 39,963 citations on 19 November, about a week left); BHL lead 3
  (BHL's bulk files), worth a dry comparison only if the fill leaves many citations once it ends.

## 1. Commons: group C, and the row a build did not write

**Group C.** 14 pages whose item names no Commons category (P373), whose name's category holds no files, while the
item's Commons sitelink names a category with files (r97-commons-count.txt). A category is named without an author, so
its name stands for every plant Kew holds by those words: Silene macrophylla's item links "Silene multifida", which Kew
holds twice, as Silene macrophylla's (Adams) Rohrb. nom. illeg. (2488433) and as a synonym of plant 2487047 (2488432).
The rule: with no P373 and the name's category empty, the sitelink's category is read only where every row of species
rank Kew's file holds in those two words (by `spellingKey`, so Quercus eduardii is Quercus eduardi) is this plant's
(`KewInfra.notOnlyThisPlant`); a name Kew does not hold, a category that is not two words ("Nageia fleuryi (seedlings)"),
or a page whose own entry is not known is not read. The record says which category was read and why, or why not.
Read in Kew's file before the build: Lophocereus marginatus, Agave sileri, Cerasus brachypetala and Lecythis zabucajo are
Kew's synonyms of their pages alone; Diplacus × australis, Koenigia × fennica and Polypodium × mantoniae are the pages'
own names with the hybrid sign; Silene multifida (two plants) and Drosera barbigera (a species Kew accepts) are not read.
Kew's file is now loaded for a build that asks Commons as well as one that asks iNaturalist.

**The row.** A build asks Commons only while the page shows fewer than twelve photographs of its own (round 69), and a
build that did not ask wrote no Commons row: 1,425 pages on 19 November, every one built online in November with twelve or
more (rules 2 and 6: the record said neither that Commons was not asked nor why). The build now writes "skipped" with
"not asked: the page shows N photographs of its own sources, and Commons is asked only while a page shows fewer than 12";
`--fill commons-record` writes the same, offline, on a page built before, dated to its build; a page with no row and fewer
than twelve is left and counted (its build's reason not known: none on 19 November). That row is no failure, so the
previous build's Commons photographs are not carried for it (`commonsEnough`). /about/how says both rules
(li#commons-asked, li#commons-category; round 96's sitelink rule was not said there before).

Tests: tests/unit/r98a-commons-group-c.test.ts (Kew's check on the count's own cases; the sitelink read and not read, and
the record; the row and the fill); r69k-index-seam reads the new call.

## 2. ISO subdivisions not matched

/about/how said 238 of ISO's subdivisions are not matched to a Natural Earth province. A code decides a record only in the
border allowance: a record within 0.02° of a border between two of Kew's regions of one country. Read against the shapes
file (scripts/tdwg3-shapes.json, its `places`): Kiribati's three groups, every island region, and the territories under
their own codes share no land border inside their country; Morocco's 87 are its regions and provinces of 2015, and Natural
Earth draws the regions before them, of which the two that reach the Western Sahara line straddle it, so no Moroccan code
could decide a record there; the others are interior or straddle their line (Istanbul, Çanakkale). Namibia's three are
not: Natural Earth draws Caprivi and Kavango, ISO names Zambezi (the Caprivi Region renamed in 2013), Kavango East and
Kavango West (Kavango divided in 2013), and Zambezi and Kavango East meet on the border of TDWG's Caprivi Strip and
Namibia. They are matched by hand (scripts/dev/r87-state-aliases.py, ISO_AS_NAMED; the table written with them): 235
not matched. Not proved for every one of the 235 that none can decide a record, so /about/how keeps saying the count,
not that it does not matter. Test: r98a 4; r87f reads 235.

## 3. The Walter–Lieth diagram

Round 87 gave the reading (the months whose rain in mm is under twice the mean temperature in °C) and left the diagram.
It is drawn under the reading in the climate class (`walter-lieth-chart.ts`, `WalterLieth.svelte`): the same median year,
temperature and rain on one scale (10 °C to 20 mm), rain over 100 mm at a tenth above a dashed line, arid months dotted
and humid ones shaded between the curves, split where they cross; the description names the reading's arid months; the
figures stay in the climograph's table. /about/how says it (li#walter-lieth-diagram). Tests: r98b (the geometry: one
scale, the crossing, the arid area the reading's months), r98c (the page: under the reading, its months the reading's,
fits 320 px, the page's colours in light and dark). Seen in Chromium on the fixture's Copiapoa cinerea, light and dark;
the unit labels first sat on the top ticks, moved clear.

## 4. /changes

Round 98's entry, two lines (the diagram; the Commons sitelink with no P373). r87p 3 and r87rec read it. The first full
launch gate found the front page moved, as round 95's did: r76p strip 2 failed in every engine, everything under "Changed
lately" 21 px higher at 1280 and 21 px lower at 1024; its base measured again in Chromium (1178, 1381, 1395, 1536 at 1280;
1222, 1414, 1428, 1569 at 1024; tiles unchanged). The same run failed WebKit's r78m desktop case twice by 0.5 px (204.64
for 204.14), on the plant page, which no change of this round reaches; alone it passed six of six in WebKit. The run
after (strip 2 and r78m passing, 2,749 passed) had one flaky test: Firefox's smoke-3 "a device a year ahead", whose
first device's sync card still read "Sending 22 of 22 changes…" at the wait's end and passed on its retry; sync, which
no change of this round reaches; alone it passed three of three in Firefox.

## 5. The order

1. The launch gate (`node scripts\predeploy.mjs --tier=launch`), the commit, the push.
2. `node scripts\corpus-step.mjs --plan scripts\corpus-plan-r98-commons.txt`: the backup, the 14 pages online, a stop to
   read their Commons rows, `--fill commons-record`, the fills, the index, the upload, the live check.
3. `node scripts\deploy.mjs`, after the upload, so /about/how's and /changes' new sentences are true of the site as served.

## The record

(Written as each step is done.)
