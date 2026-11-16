# Round 93: the names GBIF files apart, matched by rule (the record)

The plan: docs/PLAN-93.md. Run overnight on 15 to 16 November 2026, on the owner's word ("All the way"): tests, lists,
dry run and gate; commit and push; the corpus plan; the deploy. A review stop passed only where its figures hold the
plan's conditions; otherwise stopped with nothing live.

## The code

- `speciesFromHolder` (src/lib/dossier/extra-keys.ts): a page without a GBIF key takes a species GBIF holds as a synonym
  of another page's species, where Kew's file holds the name as the page's plant, of the same type; the other page leaves
  its records out. `scripts/kew-extra-keys.ts --infra-from-holder` writes it with round 86's lines; `--no-species` makes
  round 86's alone.
- `genderForms` and `kewReading`'s `how: 'gender'`: GBIF's name with its epithet in another gender is read as Kew's row of
  those words, by the same author only, and only where one form gives such a row.
- `kewPlantWords`: the record of a page that leaves records out names the other page's plant.
- Tests: tests/unit/r93a-name-keys.test.ts (on f382389: `genderForms` and `kewPlantWords` did not exist, 3626515 refused,
  Rhus copallinum read no key; FAILED). r78i's reading of `scripts/extra-keys-list.ts` takes the new option; r79m and r80r
  count the lists as this round makes them; the newest-round tests (r87p 3, r87rec 2, r76p strip 2: 65 px lower at 1280,
  43 at 1024, measured in Chromium on 16 November 2026).

## The lists

The committed lists were made on 20 to 22 October; rounds 82 to 87 changed the rule's code since, so a list made again
differs from the committed one by those rounds too. The round's own difference was taken alone: each list made on
f382389's code and on the round's from the same files, and only the lines that differ applied to the committed list.
f382389's code made round 86's committed infra list line for line (429 of 429), so the files read were the same.

| List | f382389's code | the round's | applied to the committed list |
|---|---|---|---|
| scripts/extra-keys-kew.txt | 1,987 lines | 1,935 | 59 added (all `gender`), 111 removed (all on pages given a gender key: their synonyms go with the accepted name GBIF files them under), 30 changed (keys not read); 1,960 → 1,908 on 1,429 pages |
| scripts/extra-keys-kew-none.txt | | | 10 pages read a key now, 9 lines changed; 923 → 913 |
| scripts/extra-keys.txt | 1,339 | 1,391 | 63 added (all `gender`), 11 removed (all on pages given a gender key), 7 changed; 1,340 → 1,392 |
| scripts/extra-keys-infra.txt | 429 | 1,148 | 719 added (450 `entry`, 264 `filed`, 5 `gender`), 8 changed; 429 keys on 338 pages → 1,148 on 663 |

Round 86's lines made again with `--no-species` on the round's code: 430, its 429 and one gender line (Escobaria roseana
subsp. galeanense, Kew's galeanensis); one line's key 8408593 (Phoradendron macrophyllum f. glabratum Trel.) moved from
read to not read: Kew holds the name, as f. glabrata, under the page's plant without marking it homotypic, so the type
rule of round 73 leaves it out, where before no row of it was found.

The two names the about page gives: Oxalis smalliana (k2394318) reads 3626515 from Oxalis oregana (8017574); Rhus
copallinum (k2422860) reads 3190557, by gender.

What the other rounds' code would change in the lists if they were made again whole (pages never in the October lists,
such as Ilex myrtifolia and Delphinium patens, and lines read since by another round's step) is not this round's. It is
a lead for a round of its own.

## The dry run (16 November 2026)

`--keys scripts/rebuild-r93.txt --offline --grid climate --bulk bulk --dry-run`: 979 pages (553 without a GBIF key and
69 keyed whose lines differ, and 357 pages that leave records out to them).

- 979 derived, 725 change. Climates: 192 gained, 15 lost, 189 kept with other cells; typical spots moved 334. The range
  rule's records: none admitted or dropped.
- Records in range: 105,784 gained on 362 pages, 30,808 lost on 232. GBIF's search asked 813 times for the gender keys
  the download of 21 October does not hold.
- Every loss read is the rule's transfer: a page GBIF lumps another species into keeps the records GBIF identifies by its
  own name, and the species Kew accepts reads its own. Eucalyptus tetragona 924 → 6, Eucalyptus pleurocarpa 0 → 918;
  Astilbe rubra 225 → 23, Astilbe chinensis + 2,539; Huernia lenewtonii 17 → 0, all 17 identified as Huernia keniensis,
  which Kew accepts. The 15 climates lost are such holders, left with too few placed records for a climate.

## The corpus plan

scripts/corpus-plan-r93-names.txt: backup; the dry run again, its review passed by its figures (the plan's checks); the
online `--keys` build; the flowering fill from round 92's download; the index; a review of the build's and fill's
figures; upload; live check. Then the deploy.

## The gate (16 November 2026)

`node scripts/predeploy.mjs --tier=launch`, twice. The first run: 2,736 passed and one flaky, r86m labels on the phone in
Chromium (the page did not hydrate in 30 s, passed on its retry); the strict run counts a retry as a failure, so it ran
again with nothing changed. The second: svelte-check 0 errors and 0 warnings in 1,814 files, the unit tests 6,267 passed
in 693 files, the browser suite 2,737 passed in every engine, every test first time.
