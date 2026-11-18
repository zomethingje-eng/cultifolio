# Round 95: what round 94 left, and a walk of every page (the plan)

Written 17 November 2026, after round 94 went live (7b73054, corpus bb107c441a037973). The owner: "write PLAN-95 and run
the proof. If there is anything outstanding or needs to be done, do it all in this round."

## The answer

Four changes of code, then a walk of all 48,375 pages, so every page is derived by the code of rounds 90 to 95:

1. A review that always stops (`stop`), the fault round 94's run found in its own plan.
2. A merged key's names judged as the merge is: the names GBIF files under a key the owner merged into a page are left
   out only when Kew's file holds them as another plant, as `mergedExcept` already does for a merge the rule gives no
   line. Ceropegia nubica on k505095 then reads its basionym Echidnopsis nubica, and round 94's held line can be applied.
3. The merge lines the build adds itself: measured, and the list script made to leave out what the build adds.
4. A page says the keys whose records it leaves out. 1,085 lines of the three key lists (854 + 142 + 89) leave out keys
   GBIF files under a key the page reads; the build drops those records and no page says so (rule 3: the record says
   which). Viola stipularis, round 94's case, is one.
5. The walk: round 90's typical spot (pages built before it still carry the old one: Potentilla atrosanguinea moved 129
   km when round 94 built it), rounds 93 to 95's key rules, and item 4's words, on every page.

The proof of rounds 88 and 89 runs first (CLAUDE.md: before any plan relies on them), on today's index and code.

## 0. The proof (17 November 2026)

`npm run dossier -- --index` first: the daily BHL fill of the morning wrote pages after the last index, and the proof
refuses until the index stamps them. Then `node scripts/dev/r88-prove.mjs`: 200 pages, built three ways, compared page by
page. Any difference: the walk runs with `--pages 1 --no-bulk-cache --no-api-answers`. No code is changed while it runs.

## 1. `stop`: a review that always stops

`scripts/corpus-step.mjs` carries on past a review whose `expect` checks all hold (round 89). Round 94's plan meant its
first review to stop every time and gave it three checks, so it carried on (docs/REVIEW-ROUND-94.md). A plan line
`stop <what to read>` is a review that always stops: its `expect` lines are checked and said first, as a review's are, and
a check that fails says so in the stop. `--go-on` passes it as it passes a review. Test: r95a (a `stop` with checks that
hold stops; a `review` with the same checks carries on, as before; the parser takes `expect` under a `stop`).

## 2. A merged key's names

`extraKeysFor` (src/lib/dossier/extra-keys.ts) reads a merged key whatever its type (round 78), then judges each name GBIF
files under it by the type rule against the page's entry. Ceropegia nubica (9592399) is Kew's heterotypic synonym of
Echidnopsis cereiformis, so its basionym Echidnopsis nubica (3577904, Kew's 505128, the same type as Ceropegia nubica) is
left out too: the rule's own line lists it as not read. `mergedExcept`, for a merge the rule gives no line, leaves out only
the names Kew holds as another plant (Echidnopsis uraiqatiana, 3577721, which Kew accepts and whose page k505156 reads it).
The merge is the owner's claim that the merged name is this plant; what GBIF files under it of the same plant is then this
plant's too. The change: for a key merged into the page, what GBIF files under it is judged as `mergedExcept` judges it.
Measured by making the lists again on the round's code against main's, every difference read. Test: r95b.

Measured 18 November 2026, each list made in a scratch `git archive` of main (7b73054) and of main with the round's code,
from Kew's file of 4 June 2026, GBIF's backbone export and the corpus on disk (read, never written). The infra list and the
none file are the same line for line. Six lines differ, six merges, 45 keys now read that were left out, each a name GBIF
files under the merged key and Kew's file holds as the page's plant:

- k505095 (Echidnopsis cereiformis): under Ceropegia cereiformis (9574874), 8 (Stapelia cylindrica, Echidnopsis
  tessellata, Apteranthes tessellata, Apteranthes cylindrica, Boucerosia cylindrica, Echidnopsis cylindrica, and
  Echidnopsis cereiformis var. obscura and var. brunnea); under Ceropegia nubica (9592399), round ninety-four's held line,
  Echidnopsis nubica, its basionym.
- 3948341 (Weingartia canigueralii): under Weingartia pulchra (3947359), 34, among them its own basionym Rebutia pulchra
  Cárdenas and Sulcorebutia pulchra, which the type rule left out as heterotypic to the entry.
- 7284393 (Copiapoa calderana): under Copiapoa boliviana (3959296), its basionym Echinocactus bolivianus Pfeiff.
- 3190812 (Drosera paleacea): under Drosera parvula (3190985), its autonym Drosera parvula subsp. parvula.
- 7281301 (Weingartia fidana): under Rebutia fidana (7906297), Rebutia fidana subsp. cintiensis.

The type rule left out the merged name's own basionym or autonym in three of them: the merge was read without the names
that are its own type. Echidnopsis uraiqatiana (3577721) stays left out: the backbone export does not file it under
9592399 (GBIF's API does), so the rule's line lists no exception, and the owner's `except:3577721` must be joined to it,
which is item 3's second finding.

## 3. The merge lines the build adds itself

`kew-extra-keys.ts` writes a line for a merge into a page without a GBIF key that the rule gives no line (round 80's
`forced`); the build adds a line for every merge itself (`withMergeKeys`), so a list made again never equals the committed
one by those lines, and round 94 held them by hand. Measured first: whether the build's line and the script's differ (the
script's carries `mergedExcept`, the build's only the merge's own `except:`). The script leaves out a line the build makes
the same; one that differs is said and the decision written here.

Measured: the script's two lines (7530398 into k2781125, 7281739 into k2808164) are the build's field for field (the
merge's name, ACCEPTED, the merge's own `except:`; `mergedExcept` adds nothing to either), so the script leaves them out and
says so. And a list line for a merged key takes the place of the build's line for it (`oneLineAKey`), so a list line made
without the merge's own `except:` read what the owner left out (Ceropegia nubica's 3577721, above). `withMergeExcept` joins
a merge's own exceptions to any line of its key, in the build (`withMergeKeys`) and in the list script, so the file says
what is read. The Kew list is then 1,933 keys on 1,441 pages (1,932): the held line applied. The log's "913 pages read no
key" counts k2808164, whose forced line the script leaves out though the build reads it; the none file is unchanged, 912.

## 4. A page says the keys it leaves out

`extraOccurrences` and `extraMedia` (src/lib/dossier/build.ts) drop a record or photograph whose taxon key is among the
line's `except`. The page's `occurrences.keys` keeps each key's count read, not what it left out. Each key read gets the
keys left out and how many records were dropped by them (`left`); the record's words and the page's "Other GBIF keys" say
them ("N records GBIF files under it as 5665280 left out: Kew's file holds each as another plant or another type"), and
/about/how says the rule. A page built before says nothing new until the walk derives it. Test: r95c.

## 5. The gate and the commit

`node scripts/predeploy.mjs --tier=launch`; a lone flaky test run again unchanged. Commit and push; the deploy first, so
the page shows item 4's words when the walk's pages arrive (an old page has no `left` and shows nothing new).

## 6. The walk (`scripts/corpus-plan-r95-walk.txt`)

backup; the walk (offline, its own report in place of a dry run, round 88); `stop`: the walk's totals; `--list-offline` and
the online `--keys` build of what the walk could not derive offline; the flowering fill; the index; the checks
(`--check-ranges`); a review held by its checks; upload; live check. Then the deploy after a fresh gate if the index rewrote
the about counts or the search fixture. Never begun near midnight UTC; the daily BHL run first each day (a walk that has
not finished by midnight is stopped with Ctrl+C after its page and resumed after the day's daily run).

## Done besides (17 to 18 November 2026)

- The proof: 200 of 200 pages the same each way (A 59 minutes, B 59, C 10).
- The prune, on the owner's word ("go ahead with the prune too"): `--prune` deleted from the bucket's `p/` the 83,834 files
  no manifest names (150,886 held; 67,052 named by the live manifest, every one in the bucket); the 11 dossiers in no
  index (bucket-unlisted.txt) deleted by DEPLOY.md's rclone lines, none of them on disk first, none in the bucket after.

## Held for the deploy after the walk

The /about/how sentence (keys left out, said by the page; a merged key's names) and the /changes entry for round 95: each
says what a page shows once the walk has derived it, so each goes live with the walk's pages (rule 5), not before.
