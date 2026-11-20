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

## 6. A hybrid taxon is a taxon (found at the plan's stop)

The group-C build's drops.txt held one page: Diplacus × australis (k3001034) lost its Wikidata item Q17746323 and with it
its WFO identifier, "no taxon item carries its GBIF key or Kew's IPNI identifier". The item carries both Kew's IPNI
identifier for the page (77121452-1) and the alias "Diplacus australis"; on 8 November 2026 Wikidata changed its P31 from
taxon (Q16521) to hybrid taxon (Q136343650, a subclass of taxon and of hybrid, made in October 2026), and the build takes
an item only when its P31 is one of four taxon classes (`isTaxonItem`, wikimedia.ts). The page's item before was carried
from its build of 22 October. Asked of Wikidata's query service on 20 November: 1,343 items are hybrid taxa, and 136 of the
corpus's pages hold one (Mentha × piperita, Magnolia × soulangeana, Ophrys × arachnitiformis among them), each to lose its
item, and the Wikipedia, Commons and WFO it leads to, at its next online build. Koenigia × fennica's item has the same
class and its build of 20 November kept it; its record does not say by which path, and every path that asks the class
now takes it. Hybrid taxon is now a
taxon class (`TAXON`); test r98d; Diplacus × australis built again on it alone (scripts/rebuild-r98-diplacus.txt) before
the plan goes on. No about page names the classes.

## The record

(Written as each step is done.)

**20 November 2026, the plan's first two steps.** Backup 23:31 UTC (19 November), the 14 pages built online 23:35 to
00:30: "14 built, 0 kept of 14", drops.txt one page (section 6). The Commons rows, read against the backup:
- Read, the sitelink's category taken by Kew's rule: Koenigia × fennica (5 photographs to 15), Polypodium × mantoniae (11 to
  12), Pachylecythis zabucajo by "Lecythis zabucajo" (0 to 3), Prunus brachypetala by "Cerasus brachypetala" (read, none
  taken by the photograph rules: "none", 0 before and after).
- Not read, the sitelink a spelling Kew does not hold: Eriosyce caliginiphila ("Eriosyce caligophila"), Solanum ajanhuiri
  ("Solanum ahanhuiri"), Drynaria pleuridioides ("Drynaria pleurodioides"); each "none" with the reason, 0 before and after.
- Not asked, twelve or more of their own (the new row): Quercus eduardi 83, Marginatocereus marginatus 103, Silene
  macrophylla 61, Manfreda sileri 32, Diplacus × australis 24, Tecoma castanifolia 33, Drosera silvicola 18. Silene
  multifida and Drosera barbigera, which the plan expected not read, are the categories of Silene macrophylla's and Drosera
  silvicola's items, pages that show enough of their own and ask Commons nothing.
- Photographs fewer: Manfreda sileri 56 to 32, Tecoma castanifolia 57 to 33, Silene macrophylla 73 to 61, Quercus eduardi
  105 to 83; each one GBIF's copy of an iNaturalist photograph the page shows (as round 97 found), 81 of 85, and Quercus
  eduardi's other four the photographs of one iNaturalist observation its taxon no longer returns among its 24 newest,
  three others in their place. None counted as lost by drops.txt, which counts each photograph once.

**20 November, Diplacus × australis built again** on the hybrid-taxon rule (scripts/rebuild-r98-diplacus.txt, the builder
by hand, 00:44 to 01:38 UTC): "1 built, 0 kept of 1", no drops.txt; Wikidata "ok", "found by its alias", Q17746323 and
wfo-0000650081 back, and with them iNaturalist's taxon 771946, which the item names and the page had not read before: 24
photographs to 89, Commons "not asked" (89 of its own).

**20 November, the rest of the plan** (passed at its stop at 01:49 UTC, every expect line held): `--fill commons-record`
"48375 dossiers read: 1425 given the Commons row their build did not write …; 0 with no Commons row and fewer than
twelve"; the kew-published, sources and flowering fills (48,375 pages read, 32,284 counted), none "NOT FIXED"; the index
48,375 species, climates for 38,007; corpus 706f0d6c6b97ccf5 (1,274 files written); the upload, 0 differences; the live
check 23 of 23, the site serving corpus 706f0d6c6b97ccf5. Then the launch gate on the hybrid-taxon change, its commit and
push, and the deploy (the owner: "go ahead and commit the fix and deploy").

**20 November, the launch gate on the hybrid-taxon change.** The first run: 2,748 passed, 2 flaky in WebKit, each passing
on its retry (r75g range 2, a click on a genus list's species that had not yet led to its page at the wait's end; smoke-1's
backup restore, whose confirm button had not come in 60 s), in a run of 1.4 hours where 1.2 is usual; neither page is
one the change reaches (the builder's Wikidata class test); alone each passed three of three in WebKit. Run again.

**20 November, the deploy.** Committed and pushed as 2cc913b (the change and the record) and e89438b (the about counts the
index wrote). `node scripts\deploy.mjs` ran svelte-check and the unit tests again, since the stamp names the commit it
passed on (HEAD) and the commits came after: the first run stopped on r85u-products' "a product cut off …", over its 20 s
limit (21.8 s) and passing in the gate; the second, 6,323 passed, then the build, wrangler (version a67b8c23) and the live
check, 23 of 23. Read on cultifolio.com: /changes says Round 98, /about/how li#commons-asked, li#walter-lieth-diagram and
"235 of ISO", and /species/copiapoa-cinerea draws figure#walter-lieth.
