# Round seventy-three: the open items of round seventy-two

Round seventy-three does two kinds of work. It carries out the owner's decisions on round seventy-two's open items (`REVIEW-ROUND-72.md` section 7), and it does the items that round left undone.

There were four agents, one for each area:

- **K**: names and records;
- **P**: the app and its pages;
- **L**: photographs;
- **H**: the test harness.

Their reports are `review-73/K.md`, `P.md`, `L.md` and `H.md`; the merge is `review-73/merge.md`.

`FOLD_RULES` stays 8 and the device database stays at version 4.

## 1. Records from other GBIF keys, and two merged pages (K)

**Other GBIF keys.** A page now also reads another GBIF key's records and photographs, but only where all of these hold:

- Kew's file holds that key's name and author as the page's own name, or as a name of the same type:
  - an orthographic variant;
  - a synonym Kew marks homotypic;
  - an autonym of one of these.
- GBIF does not already file the key under the page's key.
- The key is not another page's key.
- GBIF does not hold the key as a pro parte synonym.

Within a key that is read, a record that GBIF identifies as a name Kew holds as another plant is left out. The page names each key, how Kew holds it and how many records it gave (`occurrences.keys`).

The list is `scripts/extra-keys.txt`: 332 keys on 305 pages. Some examples:

| Page | Key read | Kind |
|---|---|---|
| Myrica cerifera | Morella cerifera | homonym key |
| Myrica rubra | Morella rubra | homonym key |
| Ranunculus ficaria | Ficaria verna Huds. | homonym key |
| Stapelia grandiflora, Stapelia gettliffei, Piaranthus punctatus | their Ceropegia combinations | homonym key |
| Ixora coccinea | GBIF's other "Ixora coccinea L." key | split same-name key |
| Eucalyptus camaldulensis | "Dehn." | split same-name key |
| Rubus parviflorus | Rubus nutkanus | another key for the same plant |

Heterotypic synonyms are not read. These are 1,066 keys, such as Lonicera ligustrina on Lonicera pileata. Reading them is a taxonomic decision the owner has not made, and `extra-keys-refused.txt` lists them with their reasons. None of the 332 keys is in the owner's `occurrence.zip`, so the build asks GBIF's search API for up to 900 records a key.

**Two merged pages.** Coryphantha macromeris joins Pelecyphora macromeris, and Rebutia fidana joins Weingartia fidaiana (`scripts/merged-pages.txt`). On each kept page:

- the merged page's key is read;
- the old name answers as an older name;
- the old address redirects;
- a grower's plant recorded under the old name finds the kept page.

The plant page offers "Use the reference's key", and nothing in the grower's log changes. `--prune-followed` deletes the old dossier only once the kept page records the merge. The index then holds 8,945 species, and the corpus step lets that shrink pass and no other.

## 2. The app and pages (P)

- **A lighter first visit.** The service worker is registered on a visitor's second page, at once on a collection page, or once the device holds a collection. A device that already has the worker keeps it. Measured on a first visit:

  | Page | Requests | Size |
  |---|---|---|
  | Front page | 224 → 55 | 1,083 → 376 kB |
  | Species page | 229 → 59 | 1,202 → 600 kB |

  A grower's first collection page is unchanged.
- **The phone's catalogue** opens on the 173 collector genera (`scripts/specialist-genera.txt`), with the rest under "All". The desktop is unchanged, because the server cannot tell a phone from a desktop without guessing.
- **A toast's Undo is no longer lost on a slow device.** A toast now goes only when it was raised more than 600 ms before a navigation began. Before, it went when the navigation landed more than 600 ms after the toast. A phone that took longer than that to draw My plants never showed "2026-0001 removed. Undo".
- **Records from other keys** are shown beside the page's records with a link to each key. A grower's plants, notes and follow state recorded under a merged page's name show on the kept page.
- **The vault ceilings** are stated as defaults (200 a day and 2,000 in all) that the deployment may raise. The owner is raising them to 1,000 a day and 20,000 in all.
- **A refused listing's wait** is kept across reloads.
- **The month strip** says its frozen-winter shading once.

## 3. Photographs (L)

- **Sister epithets.** A bare epithet of a sister species, as the only name in a title, reads as that species, unless the file's description names this species. Heliamphora purpurascens keeps "Heterodoxa pt12", which its description says is now that species.
- **Not the plant.** Commons files filed as a place (a river valley), a place's maps and information boards are not the plant. Boswellia papyrifera's valley goes. So does Commiphora myrrha's "Mirra", which shows a shrub of another genus.
- **Kew's accepted species in the iNaturalist filter.** Kew's accepted species now outrank GBIF's older name of the same words. Crassula cooperi gets back 7 photographs and its lead; Crassula exilis loses 9 that were of Crassula cooperi.
- **Shared photographs.** An observation GBIF misfiled goes to the page Kew names. Adenia gummifera gets back 7.
- **Checked and found sound:**
  - the 57 Pl@ntNet leads;
  - the six pages round 72 fixed for Kew's synonyms;
  - the 469 common names with no source, which are never shown or searched.

## 4. The harness (H)

- **The smoke tests run as four files.** One photograph test had failed beside the other parts. The cause was two waits that held only if the app was fast, not shared state, and both are fixed.
- **Other races made deterministic:** r62a A38 and A40, and r67h places 3 and 5.
- **WebKit timeout headroom.** r62g 3 had been at 192 s of its 240 s in WebKit.
- **New guard test:** `r73h-harness`.
- **DEPLOY.md** says how to measure a cold start's CPU with `wrangler tail` from cmd.
- **Strict Chromium and the Chromium phone at four workers:** 485 passed in 13.1 minutes. Before the split it took 15.6 minutes on a similar load.

## 5. Not done

- **Heterotypic synonyms' records:** the owner's decision; `extra-keys-refused.txt` has the facts.
- **The merged-away pages' own iNaturalist photographs** are not carried to the kept page. Both kept pages keep 20 or more.
- **`--fill commons-kind`** asks one file again on each run (one request).

## 6. Runs

- **Unit:** 3,915 passed, 8 skipped. `tsc` and `svelte-check` clean.
- **Strict Chromium and the Chromium phone at four workers:** 485 passed, 5 skipped, none flaky.
- **WebKit and Firefox:** the owner's run, `--tier=app`.

## 7. The corpus step

`scripts/corpus-plan.txt` runs, in order:

1. backup;
2. `--list-extra-keys`, then a review of the 305 pages;
3. `--keys rebuild-extra.txt --rederive --grid climate --bulk bulk`;
4. `--prune-followed`;
5. `--fill inat --bulk bulk`;
6. `--fill commons-kind`;
7. `--list-extra-keys`, which must name 0 pages;
8. `--index`, then a review;
9. the upload and the live check.

The dry run on the live corpus is in `review-73/merge.md`.
