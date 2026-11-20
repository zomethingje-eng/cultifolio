# Round 101: a warning the day GBIF stops serving our backbone; the project folder tidied

20 November 2026. The owner's decision on round 100 (docs/PLAN-100.md, 4): no move to the Catalogue of Life now; the
backbone stays pinned, and the move by rule waits for the day GBIF stops serving the backbone. This round makes sure that
day is not found out late.

## 1. The backbone check

`scripts/gbif-backbone-check.mjs` asks GBIF the three things the build asks of the backbone, each of one plant
(Fagus sylvatica, backbone key 2882316):

| asked | the backbone's answer (20 November 2026) |
|---|---|
| the name match (`/v1/species/match?name=Fagus sylvatica&strict=true`) | usageKey 2882316, EXACT |
| the species record (`/v1/species/2882316`) | datasetKey d7dddbf4-… (the backbone) |
| the occurrence search under the backbone (`checklistKey=d7dddbf4-…`) | 1,592,794 records with a coordinate |

`backboneVerdict` reads the three: all three as the backbone, "GBIF still serves the backbone our pages are pinned to";
any answered otherwise (another key, another dataset, a 404, no records), a WARNING naming which and pointing to
PLAN-100 4; a way that did not answer (no answer, 429, 5xx) is said as not answered, never as changed (rule 2), and three
unanswered say the check was not made.

The live check (`scripts/live-check.mjs`) prints the sentence as a note after its own checks, at every deploy and every
plan's `live-check` step. It never fails the check: a change at GBIF is no fault of the site, and it must stop no deploy
and no corpus step. `LIVE_CHECK_SKIP=backbone` leaves it out. Alone: `node scripts/gbif-backbone-check.mjs`. The live
check's count of checks is unchanged.

The file sits at the top of `scripts/`, so the index stamp moves with it (as with any change to the builder's code): the
next `dossier --index` writes the new stamp, as the daily plan does.

Test r101a: today's answers read as served; a COL XR key from the match, a key of another dataset or gone, and no records
under the backbone are each a WARNING; one way or all three unanswered are not answered; the URLs ask the backbone by its
checklistKey; and the live check prints it as a note with no `fail(` in its block.

## 2. The project folder

Ten working files of finished rounds (85 to 98), which no script reads and no plan to come names, moved from the top of
the folder to `bulk/old-working-files/` (not in git), with a README saying each one's round and the document that names
it. Nothing deleted. The files the builder reads or writes stay at the top (walk.json, the extra-keys files,
inat-restored.txt, ids-gbif.txt, shared-photos.txt, the check and dry-run files, derived-dataset.csv).

## The record

- The gate: `--tier=corpus` (scripts and a unit test; nothing in the app): 6,366 unit tests in 708 files, 1,036 browser
  tests, every test first time in Chromium desktop and phone. Nothing to deploy for the site; the next deploy's live check
  is the first to print the note.
