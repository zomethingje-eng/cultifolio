# Round 100: the Catalogue of Life trial, the key map and the dry-run count (the plan and record)

The plan is docs/COLXR-87.md, section 5: GBIF has moved its taxonomy from the GBIF Backbone (frozen at its build of
2023-08-28) to the Catalogue of Life eXtended Release (COL XR), and every key the corpus holds is a backbone key. This
round does steps 1 and 2 of that plan, read-only: no page is built, nothing in the corpus or the app changes. Step 3 (the
model), step 4 (a trial build) and step 5 (the owner's decision) follow from these counts.

## 1. The key map (20 November 2026)

`scripts/dev/r100-colxr-keymap.ts` (its pure parts in `scripts/colxr-keymap-lib.mjs`, tests r100a). For each GBIF key the
five files hold (`scripts/species-list.txt`, `extra-keys.txt`, `extra-keys-kew.txt`, `extra-keys-infra.txt`,
`merged-pages.txt`; holders and except: keys included), GBIF's version 2 match under COL XR (checklistKey 7ddf754f-…, "Catalogue of
Life", modified 2026-09-21, published 2026-06-19) by the key itself (`scientificNameID=gbif:<key>`) and by the
backbone's own name and author (`kingdom=Plantae`), with the backbone's own row from its export (`bulk/backbone/simple.txt.gz`).

Written to `bulk/colxr/keymap-2026-11-20.txt`, not `scripts/` as COLXR-87 planned: a data file at the top of `scripts/`
changes the index stamp (round 99's first gate stopped on it). It is not in git; its header names its sources. ChecklistBank's
mapping file was not read (the two GBIF routes answered every key).

- 62,241 keys; every one answered (4 at a time, 0.3 s between rounds; no key left unanswered).
- By identifier: 60,850 EXACT to a taxon COL XR accepts, 57 to one it provisionally accepts, 1,334 to nothing ("No
  name given"). The identifier route always gives COL XR's accepted taxon (a synonym's key reaches its accepted taxon).
- By name: 47,170 EXACT accepted, 13,610 EXACT synonym, 864 ambiguous synonym, 294 VARIANT, 287 HIGHERRANK, 15
  provisionally accepted, 1 misapplied. The name route keeps a synonym's own COL XR name, which the identifier route loses.

## 2. The dry-run count

`scripts/dev/r100-colxr-count.ts` (its pure parts in `scripts/dev/r100-colxr-count-lib.mjs`, tests r100b), offline from
the map and the key files; the figures and every list in `bulk/colxr/count-2026-11-20.txt`. A key's COL XR taxon is
its match by identifier: the taxon its records would be filed under.

**Pages.** 48,375; 46,021 with a GBIF key, 2,354 with none (no backbone key, so nothing to map; a name published after
August 2023 among them may have a COL XR taxon, not counted here).

| of the 46,021 keyed pages | n |
|---|---|
| no COL XR taxon by identifier | 204 (0.4%) |
| a COL XR taxon of the page's own name | 45,254 |
| a COL XR taxon of another name | 563 (1.2%) |
| COL XR taxa reached by one page alone | 45,707 |
| COL XR taxa reached by two pages or more | 54 taxa, 110 pages |

- The 204 with none: GBIF's note is "No name given" for each. By name, 192 of them match: 129 EXACT accepted, 35 EXACT
  synonym (and 8 more, of the backbone's DOUBTFUL), 14 VARIANT, 12 HIGHERRANK (the genus). So most are gaps in GBIF's
  identifier map, not names COL XR lacks; a move would need a rule for them (the name route's EXACT only, said so).
- The 563 of another name are of three kinds, read on a sample: a genus moved (Anacampseros prominens to Avonia prominens,
  Inula rhizocephala to Pentanema rhizocephalum), a spelling (Melocactus lemarii to M. lemairei, Salvia regla to S.
  regia), and another species (Salvia miniata to Salvia pansamalensis). The page keeps Kew's name either way; the third
  kind would read another species' records.
- The 54 shared taxa are each a merge decision: two of our pages whose backbone keys COL XR files under one taxon
  (Peperomia prostrata and P. rotundifolia, Cotoneaster dammeri and C. radicans, Araucaria laubenfelsii and A. montana).

**Other keys.** Each is counted onto nothing, onto its own page's COL XR taxon (redundant), onto another page's (a
conflict), or onto a taxon of its own (kept as a key).

| file, kind | n | nothing | own page's | another page's | its own |
|---|---|---|---|---|---|
| extra-keys.txt, read | 1,391 | 571 | 572 | 5 | 243 |
| extra-keys.txt, left out (except) | 1,012 | 92 | 171 | 199 | 550 |
| extra-keys-kew.txt, read | 1,933 | 43 | 0 | 1 | 1,889 |
| extra-keys-kew.txt, left out | 9,268 | 268 | 0 | 20 | 8,980 |
| extra-keys-infra.txt, read | 1,148 | 15 | 0 | 531 | 602 |
| extra-keys-infra.txt, left out | 1,486 | 142 | 0 | 15 | 1,329 |

- extra-keys.txt's 571 onto nothing are mostly the backbone's DOUBTFUL keys, which COL XR does not hold; their records
  would be lost to the page unless COL XR files them elsewhere. Its 572 onto the page's own taxon would be redundant.
- 171 keys a page now leaves out reach that page's own COL XR taxon: their records would come in, which the page's rule
  (Kew holds them as another plant, or a pro parte synonym) keeps out today.
- The Kew file's pages have no GBIF key of their own, so "own page's" cannot occur; its keys' taxa would be the page's.
- extra-keys-infra.txt's 531 onto another page's taxon are the infraspecific keys GBIF files under a holder page: COL XR
  files them under that page's taxon, so the page that reads them today would lose them to the holder.

**Records under each taxonomy.** Each keyed page's records by GBIF's occurrence count, the backbone key with the backbone
named and its COL XR taxon with COL XR named (`scripts/dev/r100-colxr-records.ts`, to `bulk/colxr/records-2026-11-20.txt`).
Asked 20 November 2026, a hundred taxa a request faceted by species key (the builder's own way of counting, bulk-fetch.ts),
the 681 taxa the facet did not list asked alone; every page answered. The lists are in `bulk/colxr/count-2026-11-20.txt`.

| of the 46,021 keyed pages | n |
|---|---|
| no COL XR taxon (not counted) | 204 |
| the same count | 30,600 |
| within a fifth | 13,655 |
| fell by more than a fifth | 347 (300 of them from 100 records or more) |
| rose by more than a fifth | 1,215 (881 from 100 or more) |

In all, 510,421,659 records under the backbone and 515,064,705 under COL XR (a taxon two pages share counted on each).

- Only part of the moves is the count's other lists: of the 347 falls, 28 are pages of another name (1 also a shared
  taxon); of the 1,215 rises, 134 are of another name and 71 share a taxon (52 both). The rest, about 1,100 pages, keep
  their name and still move by more than a fifth: COL XR files other names under the taxon than the backbone did.
- The largest falls are common European plants whose synonyms COL XR files elsewhere: Dactylorhiza maculata 732,790 to
  419,423, Lamium galeobdolon 756,599 to 456,793, Galium palustre 725,326 to 513,995, Salvia blancoana 34,293 to 955.
- Some of the largest rises are errors (section 3 says whose): Rubus fruticosus (8436459) reaches Dasiphora fruticosa
  (3475B, a shrubby cinquefoil, which our own Dasiphora fruticosa page also reaches), Alopecurus pratensis reaches
  Alopecurus arundinaceus (C52K, 13,205 records to 622,010 on that page). Others are hybrids or
  segregates COL XR sinks into the parent: Fagus × taurica into Fagus sylvatica (555 to 1,611,370), Ulmus elliptica into
  Ulmus glabra (92 to 409,386).

**What the count says.** About 98% of keyed pages map one to one with their own name, but a move is not mechanical: the
563 of another name and the 54 shared taxa need reading (section 3 reads them by rule), the 204 with no taxon need a rule (most match by name), and the other keys' rules must be read from
COL XR's own tree, as COLXR-87 planned (531 infraspecific keys would move to their holder page, 171 keys now left out
would come in).

## 3. The reading by rule (20 November 2026)

`scripts/dev/r100-colxr-read.ts` (its rules in the count's lib, tests r100d), offline from the map and Kew's file
(`bulk/wcvp_names.csv`, 1,048,616 rows of species rank); every page and its verdict in `bulk/colxr/read-2026-11-20.txt`.

**GBIF's two routes are one.** On all 45,817 pages with a COL XR taxon, the taxon by identifier is the taxon the
backbone's name and author reach by name (its own, or a synonym's accepted). GBIF's map by identifier is in effect its
name match, so it is no check on it, and section 2's first draft, "errors of GBIF's map by identifier", was said too
soon: Rubus fruticosus L. is held by COL XR itself as a synonym of Dasiphora fruticosa, and Alopecurus pratensis L. was
matched to "Alopecurus pratensis Bourg. ex Lange", another author's name, which COL XR holds under A. arundinaceus.

**The rules**, in order: where Kew's file places COL XR's name (by genus and the epithet's spelling key, every row of
species rank): as this page's plant, another, both, or not at all; for another plant, whether Kew's family of it is the
page's plant's family; then whether GBIF matched the backbone name's own author (two authors are one where they share a
name, an abbreviation of three letters or more allowed: "Fisch." and "Fischer", "Rchb." and "Rchb. ex Spreng."; "L." and
"Bourg. ex Lange" are two).

| verdict | other name (563) | sharing a taxon (110) |
|---|---|---|
| the same plant under another name: Kew holds COL XR's name as this plant's | 301 | |
| the taxon's own page (Kew holds its name as this page's plant) | | 46 |
| COL XR files the name under a plant Kew keeps apart: a lump, or an error in COL XR | 127 | 53 |
| COL XR's name not in Kew's file | 126 | 2 |
| Kew holds the name for this plant and another | 7 | 7 |
| GBIF matched a homonym (another author's name): wrong | 1 (Alopecurus pratensis) | 1 |
| COL XR's taxon of another family than the page's plant: wrong | 1 (Ixora coccinea to Embothrium coccineum, Rubiaceae to Proteaceae) | 1 |

- The 301 settle by rule: COL XR's name is one Kew holds for the page's own plant (genus moves such as Anacampseros
  prominens to Avonia prominens, spellings such as Melocactus lemarii to M. lemairei). A move keeps Kew's name on the
  page and reads the same plant's records.
- The 127 and 53 are mostly real differences of taxonomy, read on a sample: COL XR sinks a species Kew keeps, as a
  synonym or a subspecies (Cochlearia scotica as C. officinalis subsp. scotica, Cotoneaster radicans into C. dammeri).
  114 of the 127 stay in their genus. The 13 that cross genera hold the clear errors no rule here can tell from a lump:
  Rubus fruticosus to Dasiphora fruticosa, Erythrina afra to Senegalia caffra, Cirsium acaulon to Onopordum acaulon.
  Under a move each of these pages would read another plant's records, so a move needs them read by a person, or left on
  the backbone's key with the reason said.
- The 126 not in Kew's file are mostly genera newer than Kew's, or that Kew does not accept (Balbinaea for Echeveria
  secunda, Madasenecio for Senecio crassissimus, Chodatia for Polygala arillata), and COL XR's infraspecific taxa
  (Cladoceras pavettoides subsp. pavettoides).
- 15 pages are GBIF's alone (no Kew row; their ids are g<key>): the rules compare them with no Kew plant of their own,
  so a COL XR name Kew holds is "another plant" for them.

## 4. The model and the trial (decided 20 November 2026; the trial waits for GBIF's download)

**The model, decided, not yet built.** A COL XR id is kept beside the GBIF key (`ids.col` in a page, `col` in the
index), never in its place, and only once the owner decides to move: until then nothing a page shows comes from COL XR,
and a field no page reads would be a field the about pages must explain (rule 5) for no reader. A page reads COL XR's
taxon only where section 3's rules settle it (the same plant, or its own name); the rest keep the backbone's key with the
reason said (rule 3). The 204 with no taxon by identifier take the name route's EXACT match only, said so. The other
keys' rules are read from COL XR's own tree, not mapped key by key.

**The trial's sample and download** (`scripts/dev/r100-colxr-trial.ts`): 812 pages, 200 at random (seed 100), every
page of another name (563), every page sharing a taxon (110); 756 COL XR taxa, about 8.5 million records under them in
all (fewer with a coordinate). The request (`bulk/colxr/request-colxr-trial.json`) is a Darwin Core Archive filtered
and written under COL XR (both checklistKeys COL XR's, so the records' key columns are COL XR's), with every download's
filters (a coordinate, no geospatial issue, present). GBIF's validation does not take predicate requests (HTTP 422, "not
implemented"); the request's form is the one our backbone downloads use, with COL XR's checklistKey and ids.

**What the trial needs next**, in order:
1. The download, asked with the owner's GBIF account (the same variables bulk-fetch.ts reads; nothing else is sent):
   `node --import tsx scripts/dev/r100-colxr-trial.ts --submit`. GBIF prepares it in some hours; its key is kept in
   `bulk/colxr/download-colxr-trial.json`.
2. The records filed under the pages: each record's COL XR taxon to the trial page that reaches it, written as the
   plain occurrence.csv the builder already reads (bulk-load.ts), so the builder is not changed.
3. The trial build in a separate checkout (a git worktree, whose `static/s/` is its own), never into the live corpus,
   then each page's records, regions and climate read against the live page, each difference said.
4. The owner's decision.

Steps 2 and 3 are written once the download is in hand and its columns read, not before.

## The record

- 20 November 2026: the key map (62,241 keys, every one answered); the offline count; each page's records under both
  taxonomies (46,021 pages, every one answered); tests r100a and r100b.
- 20 November 2026 (later): the reading by rule (section 3, test r100d); the trial's sample and request (section 4);
  /backup's preview waits for the collection (below, test r100c).
- The gate of the first commit (effd066): `--tier=corpus` (nothing in the app changed): 6,346 unit tests in 705 files, 1,034 browser tests, every test
  first time in Chromium desktop and phone.
- The gate of the second commit: `--tier=launch` (the app changed: /backup): svelte-check 0 errors, 6,353 unit tests in
  706 files, 2,761 browser tests, every test first time in every engine, on the third run. The first stopped on
  svelte-check (r100b's tallies typed as unknown; cast); the second on one Firefox test, r62g 4 on /plants/import, which
  passed on its retry: it ticked "Show only lines that need me" while the names were still being asked, and their answers
  lengthened the summary above the box, so the tick landed where the box no longer was. The test now waits for the
  answers (8 of 8 in Firefox); the page was right.

**/backup's preview after the collection.** Round 99's second gate lost a press in WebKit on /backup's "What's in the
file" (r69p P5): the keep-your-plants card, which appears once the collection holds plants, arrived after the file's
preview and moved it 113 px down under the press. Round 99's key gate makes the collection open a little later, so the
preview could come first. The preview now waits for the collection to open (`onFile` in backup/+page.svelte). Test r100c:
a device with 1,000 plants opens a one-plant file as the page loads; the card must be on the page when the preview
first is. Without the change it failed in Chromium phone and WebKit phone ("preview first"); with it, it passes in all
five engines.
