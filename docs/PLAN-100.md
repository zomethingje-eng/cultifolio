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
- Some of the largest rises are errors of GBIF's map by identifier, not of COL XR: Rubus fruticosus (8436459) reaches
  Dasiphora fruticosa (3475B, a shrubby cinquefoil, which our own Dasiphora fruticosa page also reaches), Alopecurus
  pratensis reaches Alopecurus arundinaceus (C52K, 13,205 records to 622,010 on that page). Others are hybrids or
  segregates COL XR sinks into the parent: Fagus × taurica into Fagus sylvatica (555 to 1,611,370), Ulmus elliptica into
  Ulmus glabra (92 to 409,386).

**What the count says.** About 98% of keyed pages map one to one with their own name, but a move is not mechanical: the
563 of another name and the 54 shared taxa need reading one by one (the map by identifier is wrong on some, as Rubus
fruticosus shows), the 204 with no taxon need a rule (most match by name), and the other keys' rules must be read from
COL XR's own tree, as COLXR-87 planned (531 infraspecific keys would move to their holder page, 171 keys now left out
would come in). Step 3 (the model) and step 4 (a trial build of the 200 sampled pages, the other-name and shared ones)
are next; the decision to move stays the owner's.

## The record

- 20 November 2026: the key map (62,241 keys, every one answered); the offline count; each page's records under both
  taxonomies (46,021 pages, every one answered); tests r100a and r100b.
- The gate: `--tier=corpus` (nothing in the app changed): 6,346 unit tests in 705 files, 1,034 browser tests, every test
  first time in Chromium desktop and phone.
