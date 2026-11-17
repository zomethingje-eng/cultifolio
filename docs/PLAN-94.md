# Round 94: the extra-keys lists made again whole (the plan)

Round 93 (docs/REVIEW-ROUND-93.md, "The lists") applied only its own difference to the committed lists, made 20 to 22
October, and left for a round of its own what the code of rounds 80 to 87 would change if the lists were made again whole.
This is that round. Measured on 16 November 2026, nothing applied, nothing run on the corpus.

## The answer

A whole regeneration changes very little, and all of it is sound but three lines. Apply it: 24 keys on 12 pages that
have read no records since round 80, one key no longer read under Viola stipularis, and two dead or cosmetic lines. Then
build 13 pages again. The infra list is unchanged line for line.

| List | committed | made again on main (62e9343) | to apply |
|---|---|---|---|
| scripts/extra-keys-kew.txt | 1,908 keys on 1,429 pages | 1,935 on 1,442 | 1,932 on 1,441: 24 added on 12 pages, 2 changed; 3 lines held |
| scripts/extra-keys-kew-none.txt | 913 pages | 912 | 912, whole: 1 removed, 1 reordered |
| scripts/extra-keys.txt | 1,392 keys | 1,391 | 1,391, whole: 1 dead line removed |
| scripts/extra-keys-infra.txt | 1,148 keys on 663 pages | 1,148 on 663, the same | nothing |

## How it was measured

- Each list made in scratch from Kew's file of 4 June 2026 and GBIF's backbone export, the files round 93 read:
  `scripts/kew-extra-keys.ts` (with and without `--infra-from-holder`) and `build-dossiers.ts --list-extra-keys`. The
  corpus's pages on disk were read, never written, and nothing in this folder was written but this plan, the rebuild list
  and the corpus plan.
- Each run in a `git archive` of the commit's tree, so no list in `scripts/` was written: main's (62e9343), and every
  commit that changed the rule's code or its inputs since the lists were made: 3adcb3c (round 79), 0349d13 (round 80),
  3b24a61 (81), 66d48c3 (82), 7874a12 (84), 64e7bee (85), 53bd970 and eca27a4 (86), d049a10 (87), f382389 (92). Each
  difference is put to the first commit from which main's form of the line holds, unbroken.
- The method checked: main's tree made the same lists as a run of main's scripts from this folder, line for line; 3adcb3c's
  made 1,956 keys on 1,415 pages, the October list's own header figure.
- Every new key read against Kew's file and GBIF's backbone (each key's usage and the usage GBIF files it under), and
  against the index of 16 November.

## The differences, by cause

### 1. Round 80's twelve pages (0349d13): 24 keys on 12 pages, to apply

`scripts/extra-keys-kew-none.txt` says it in its header: twelve pages became keyless after the Kew list was made on 20
October (agent X's held-range fix and the Gymnosporia homonym), "so each says the general reason until the next
refresh". The refresh gives them keys of Kew's synonymy. Each of the twelve has no records on the site now.

| Page | keys | what they are |
|---|---|---|
| k2861129 Ilex myrtifolia | 5414227, 5414228, 5533662, 7708282 | Ilex myrtifolia Walter, Kew's accepted name, which GBIF holds as a synonym of its later homonym Ilex myrtifolia Lam. (8223071, illegitimate in Kew), and three infraspecific names Kew files under Walter's |
| k2760205 Delphinium patens | 3033779, 3921674, 3926650 | Delphinium patens Benth. (GBIF: a synonym of its own subsp. patens) and two varieties Kew files under it |
| k2836016 Gymnosporia acuminata | 7662985, 3791158, 7265620 | Gymnosporia acuminata Hook.f. ex M.A.Lawson, which GBIF files under Gymnosporia oxyphylla, and Maytenus oxyphylla and Maytenus hookeri, which Kew files under it |
| k2360109 Maytenus acuminata | 3791985 | Gymnosporia acuminata (L.f.) Szyszył., illegitimate in Kew, homotypic with the entry; the key the species list gave the other Gymnosporia acuminata before round 80's homonym fix |
| k2476687 Strobilanthes maculata | 7655635, 3776920, 7852781 | the entry's name by its own author, and Sympagis maculata and Ruellia maculata |
| k3320793 Alsophila dealbata | 3598702, 5650675 | Cyathea dealbata and Polypodium dealbatum |
| k3234994 Haplopappus glutinosus | 8213611, 3100504 | Haplopappus glutinosus Cass. and Diplopappus coronopifolius |
| k2551191 Pimelea villosa | 7716669, 6021585 | Pimelea villosa Sol. ex Sm. and Banksia villosa |
| k2727610 Cleome spinosa | 3872451 | Tarenaya spinosa (Jacq.) Raf., homotypic, with 11 keys under it not read |
| k2800308 Erysimum ochroleucum | 3048503 | Erysimum humile Pers., homotypic, with 23 keys under it not read |
| k2344177 Ligusticum ferulaceum | 3633282 | Coristospermum ferulaceum, homotypic, with 3 keys under it not read |
| k2953596 Potentilla atrosanguinea | 11336234 | Potentilla atropurpurea DeVriese, Kew's orthographic variant |

Checks: every key's GBIF parent is no key of the reference (index and species list), so no page leaves records out to
them; none is read by another page in any of the four lists; the 24 keys are 24 different keys. Delphinium patens and
Ilex myrtifolia are the two round 93's record named.

### 2. Round 85's rule (64e7bee): Viola stipularis, to apply

k2461487 reads GBIF's Viola stipularis Sw. (8347707). GBIF files Viola fruticosa W.Becker (5665280) under it; Kew accepts
Viola fruticosa as its own species (2459976, which has no page here). On round 85's code the rule lists 5665280 among the
keys not read, so the page leaves those records out (rule 3). Today the page reads 8347707 with no key left out (776
records, built 13 November from the October list), so GBIF's records of Viola fruticosa filed under it are among them.

### 3. Round 82's merge and round 84's code: the merged keys, held

Main's `kew-extra-keys.ts` writes a line for each merge into a page without a GBIF key that the rule gives no line
(7530398 into k2781125, Echeveria peacockii; 7281739 into k2808164, Bisnaga hamatacantha). The build adds every merge's
line itself from `scripts/merged-pages.txt` (`withMergeKeys`), so these lines change nothing the build reads. Held, for a
second reason: 7281739 is a key of the species list (the line "Bisnaga hamatacantha … already in the reference"), the
same key round 93's rebuild list named as a page, and r79m holds that no line of the Kew list is a list key.

With them, round 82's merge (66d48c3) takes k2808164 (Ferocactus hamatacanthus) out of the none file: it reads its
merge's key and round 86's keys. Apply that.

### 4. Round 80's merge (0349d13): Ceropegia nubica on k505095, held; two lines applied

- Held: the rule's own line for 9592399 (Ceropegia nubica) on k505095 (Echidnopsis cereiformis) lists 3577904 (Echidnopsis
  nubica) as not read, where the owner's merge (`merged-pages.txt`, `except:3577721`) leaves out Echidnopsis uraiqatiana,
  which Kew accepts. The build keeps the first of two merge lines for a key (`oneLineAKey`), so applying this line would
  read Echidnopsis uraiqatiana's records into the page. The page stays as the merge makes it.
- Applied: k505095's line for 9574874 (Ceropegia cereiformis) names its merge (`ceropegia-cereiformis`); the build
  already reads it so.
- Applied: `extra-keys.txt`'s line for page 9574874 reading 9592399, written on 21 October when Ceropegia nubica was merged
  into Ceropegia cereiformis. Round 80 merged both into k505095 the next day; 9574874 has had no page since, and nothing
  reads the line.

### 5. Round 85 (64e7bee): one reordering, applied

k2613882's none line lists two usages of Acacia longifolia var. sophorae in the other order. The page's sentence
(`noKeyWhy`) is the same either way (checked), so no page changes and no fill is needed.

### Not found

No line removed from the Kew list or the infra list. Round 85's lines made from GBIF's API (the 18 pages of decision 6)
are all made again from the export. No difference in the Kew lists comes from rounds 81, 86 or 87's code. The keyed list
was made on main alone: its one difference is put to round 80 by the history of `merged-pages.txt`, not by a run.

## What to apply

The lists were made and checked in a scratch folder, with the regenerated lists and the tools, and copied in:

1. `scripts/extra-keys-kew.txt`: main's list made again, less the three held lines; a round-94 header line says which.
2. `scripts/extra-keys-kew-none.txt` and `scripts/extra-keys.txt`: main's lists made again, whole, with a header line each.
   The none file's notes on the twelve and on round 85's merge go; round 93's stays.
3. `tests/unit/r79m-kew-keys.test.ts`: 1,932 keys on 1,441 pages (was 1,908 on 1,429).
   `tests/unit/r80r-no-key.test.ts`: 912 pages, of the 913 that read no key, k2808164 the one apart and named
   (was 913 of 925, the twelve apart); kinds 655 lumped, 205 none, 43 other-type, 8 other-author, 1 other.
   On 62e9343 with its lists, both FAILED (1908 for 1932; 913 for 912). With the new lists, those two and the other seven
   test files that read the lists (r73k, r78i merges, r80x list, r84e, r86f doubtful, r86s San Pedro, r93a) passed: 97
   tests.
4. No about page, test or code states the lists' counts (searched), so no served text changes. No /changes entry: no rule
   changes, and 13 pages.

## The pages to build again

`scripts/rebuild-r94.txt`, 13 pages: the twelve and Viola stipularis. Every line is a page of the index of 16 November
without a GBIF key, with its dossier on disk. No page leaves records out to them, so no holder is listed (round 93's
lesson: the list names no GBIF key that is not a page).

23 of the 24 keys are not in the occurrence download of 21 October (its `bulk/keys.json`), so the build is online and
GBIF's search is asked for them. 3791985 is in it.

## The steps

1. The ready lists and the two tests copied in (16 November 2026: the sets of lines differ from the committed lists
   exactly as the table says; the keyed list comes out in another order, and no key is on two of its lines, so the order
   changes nothing the build reads); the gate; the commit (the owner's word).
   ```
   node scripts/predeploy.mjs --tier=launch
   ```
2. The corpus plan, `scripts/corpus-plan-r94-lists.txt`: a backup; the offline dry run of the 13 pages, its review always
   stopping (P = 13, the range rule admitting and dropping none; read each page's records); the online `--keys` build;
   the flowering fill from round 92's download; the index; a review (13 built, 48,375 pages); upload; live check. No deploy.
   ```
   node scripts\corpus-step.mjs --plan scripts\corpus-plan-r94-lists.txt
   ```

## Leads, not this round's

- `kew-extra-keys.ts` writes the merge lines the build adds itself, so a list made again never equals the committed one
  by those two lines. It should leave them to the build, as `--list-extra-keys` does for keyed pages.
- `oneLineAKey` keeps the first merge line's keys not read when two lines name the same merge. Joining both lists of keys
  not read would let the rule's own merge lines be applied without losing the owner's.
- Why the rule reads Ceropegia nubica on k505095 but not its basionym Echidnopsis nubica, which Kew files under the same
  entry: the type rule of round 73, to be read before anything changes there.
